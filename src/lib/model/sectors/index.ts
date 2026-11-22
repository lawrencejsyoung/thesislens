import type { CompanyFundamentals } from "../../fundamentals/types";
import type { CompanyModel } from "../types";
import { buildFinancialSectorModel, type FinancialSectorOptions } from "./financials";
import { applyRealAssetSectorValuation } from "./real-assets";
import { applyPharmaOrAutoValuation, type PipelineAsset } from "./pharma-auto";

export * from "./financials";
export * from "./real-assets";
export * from "./pharma-auto";

const FINANCIAL_TEMPLATES = new Set(["bank", "insurance", "capital-markets"]);

export function isFinancialSectorTemplate(templateId: string): boolean {
  return FINANCIAL_TEMPLATES.has(templateId);
}

/**
 * Dispatches financial templates (bank, insurance, capital-markets) to their equity-side
 * residual-income / embedded-value / fee-ROE engines.
 */
export function buildSpecialistFinancialModel(
  f: CompanyFundamentals,
  opts: FinancialSectorOptions = {}
): CompanyModel {
  return buildFinancialSectorModel(f, opts);
}

/**
 * Applies Phase 6 specialist overlays to operating-company FCFF models
 * (REITs, Utilities, Energy/Materials, Pharma/Biotech, Autos).
 */
export function enhanceOperatingModelForSector(
  model: CompanyModel,
  f: CompanyFundamentals,
  opts: { pipelineAssets?: PipelineAsset[] } = {}
): CompanyModel {
  if (model.templateId === "reit" || model.templateId === "utility" || model.templateId === "energy" || model.templateId === "materials") {
    return applyRealAssetSectorValuation(model, f);
  }
  if (model.templateId === "pharma" || model.templateId === "auto") {
    return applyPharmaOrAutoValuation(model, f, opts);
  }
  return model;
}
