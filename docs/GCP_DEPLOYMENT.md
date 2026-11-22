# ThesisLens — Production GCP Cloud Run & GitHub Actions Deployment Guide

This guide walks through provisioning a hardened Google Cloud Platform (GCP) environment for **ThesisLens** with **keyless GitHub Actions CI/CD** via Workload Identity Federation (WIF), **Artifact Registry**, **Secret Manager**, and **Cloud Run**.

---

## Architecture Overview

- **CI Pipeline** (`.github/workflows/ci.yml`): Runs on every PR and push to `main` — TypeScript check, ESLint, quant/MCP/security test suites, Next.js standalone build, `npm audit`, Gitleaks secret scan, and Trivy container vulnerability scan (uploaded to GitHub Security SARIF).
- **CD Pipeline** (`.github/workflows/deploy-gcp.yml`): Runs on push to `main` or manual `workflow_dispatch` — authenticates to GCP with short-lived OIDC tokens (Workload Identity Federation, zero JSON keys), builds & Trivy-scans the container, pushes an immutable digest to Artifact Registry, deploys to Cloud Run with Secret Manager bindings, and runs a `/api/health` smoke test.
- **Container** (`Dockerfile`): Multi-stage `node:22-alpine` build using Next.js `output: "standalone"`, running as unprivileged user `nextjs` (UID 1001) on port `8080`.

---

## 1. Set Shell Variables

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="northamerica-northeast1" # Montreal (closest to Sudbury, ON)
export REPO_NAME="thesislens"
export SERVICE_NAME="thesislens"
export GITHUB_REPO="your-github-org/your-repo-name" # e.g. octocat/hackdevsudbury

gcloud config set project "$PROJECT_ID"
```

---

## 2. Enable Required GCP APIs

```bash
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  cloudresourcemanager.googleapis.com
```

---

## 3. Create Artifact Registry Repository

```bash
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="ThesisLens production container images"
```

---

## 4. Create Secrets in GCP Secret Manager

Never commit `GEMINI_API_KEY` or `MCP_API_KEY` to GitHub or bake them into Docker images.

```bash
# 1) Google Gemini API Key
printf '%s' "YOUR_REAL_GEMINI_API_KEY" | \
  gcloud secrets create GEMINI_API_KEY --data-file=- --replication-policy=automatic

# 2) Strong random Bearer token for /api/mcp (required in production)
openssl rand -hex 32 | tr -d '\n' | \
  gcloud secrets create MCP_API_KEY --data-file=- --replication-policy=automatic
```

---

## 5. Create Least-Privilege Service Accounts

### A. Cloud Run Runtime Service Account
Only granted `secretmanager.secretAccessor` on the two required secrets.

```bash
export RUNTIME_SA="thesislens-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create thesislens-runtime \
  --display-name="ThesisLens Cloud Run Runtime"

for SECRET in GEMINI_API_KEY MCP_API_KEY; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

### B. GitHub Actions Deployer Service Account
Only granted permissions to push images to Artifact Registry, deploy Cloud Run, and act as the runtime SA.

```bash
export DEPLOYER_SA="thesislens-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam service-accounts create thesislens-deployer \
  --display-name="ThesisLens GitHub Actions Deployer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:${DEPLOYER_SA}" \
  --role="roles/iam.serviceAccountUser"
```

---

## 6. Configure Workload Identity Federation (Keyless OIDC)

```bash
export PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
export WIF_POOL="github-actions-pool"
export WIF_PROVIDER="github-oidc-provider"

gcloud iam workload-identity-pools create "$WIF_POOL" \
  --location="global" \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc "$WIF_PROVIDER" \
  --location="global" \
  --workload-identity-pool="$WIF_POOL" \
  --display-name="GitHub OIDC Provider" \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GITHUB_REPO}' && assertion.ref == 'refs/heads/main'"

gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/attribute.repository/${GITHUB_REPO}"
```

Print the full WIF provider resource name (needed for GitHub repository variables):

```bash
echo "projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL}/providers/${WIF_PROVIDER}"
```

---

## 7. Configure GitHub Repository Variables & Environments

In GitHub: **Settings → Environments → New environment → `production`** (recommended: enable Required Reviewers for manual approval).

Then in **Settings → Secrets and variables → Actions → Variables**, add:

| Variable Name | Example Value |
|---|---|
| `GCP_PROJECT_ID` | `your-gcp-project-id` |
| `GCP_REGION` | `northamerica-northeast1` |
| `ARTIFACT_REGISTRY_REPO` | `thesislens` |
| `CLOUD_RUN_SERVICE` | `thesislens` |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | `projects/<NUMBER>/locations/global/workloadIdentityPools/github-actions-pool/providers/github-oidc-provider` |
| `GCP_DEPLOYER_SERVICE_ACCOUNT` | `thesislens-deployer@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SERVICE_ACCOUNT` | `thesislens-runtime@<PROJECT_ID>.iam.gserviceaccount.com` |
| `GEMINI_MODEL` *(optional)* | `gemini-2.5-flash` |
| `ALLOW_CLIENT_API_KEY_OVERRIDE` *(optional)* | `true` (set `false` to strictly enforce server key only) |

---

## 8. Recommended Edge Protection (Cloud Armor)

ThesisLens includes application-level sliding-window rate limiting in `src/middleware.ts`. For multi-instance Cloud Run autoscaling, place an **External Application Load Balancer + Cloud Armor** in front of Cloud Run with:
- Preconfigured WAF rules (`xss-v33-stable`, `sqli-v33-stable`, `protocolattack-v33-stable`)
- Edge IP rate-limiting policy (e.g., 60 req/min per IP, ban 300s)
- Cloud Run ingress restricted to `--ingress=internal-and-cloud-load-balancing`
