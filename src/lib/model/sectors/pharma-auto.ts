import type { CompanyFundamentals } from "../../fundamentals/types";
import type { CompanyModel, SectorValuationDetail } from "../types";
import { rescaleModelValue } from "./real-assets";

export interface PipelineAsset {
  name: string;
  phase: "phase1" | "phase2" | "phase3" | "filed";
  peakSales: number;
  yearsToLaunch: number;
  patentLifeYears?: number;
  operatingMargin?: number;
}

const PHASE_POS: Record<PipelineAsset["phase"], number> = {
  phase1: 0.12,
  phase2: 0.28,
  phase3: 0.58,
  filed: 0.85,
};

/**
 * Computes risk-adjusted NPV (rNPV) for a list of clinical pipeline assets.
 */
export function computePipelineRnpv(assets: PipelineAsset[], wacc: number, taxRate = 0.2): number {
  let total = 0;
  for (const a of assets) {
    const pos = PHASE_POS[a.phase];
    const margin = a.operatingMargin ?? 0.45;
    const life = a.patentLifeYears ?? 10;
    const annualNopat = a.peakSales * margin * (1 - taxRate);
    // Ramp 3 years to peak, hold, then patent cliff
    let pv = 0;
    for (let y = 1; y <= life; y++) {
      const ramp = y === 1 ? 0.35 : y === 2 ? 0.7 : 1.0;
      pv += (annualNopat * ramp) / Math.pow(1 + wacc, a.yearsToLaunch + y);
    }
    total += pv * pos;
  }
  return total;
}

/**
 * Enhances a Pharma/Biotech or Auto CompanyModel with Phase 6 specialist adjustments:
 * - Pharma (`pharma`): Adds risk-adjusted pipeline NPV (rNPV) on top of commercial portfolio DCF.
 * - Autos (`auto`): Separates captive-finance debt from industrial net debt in the EV-to-equity bridge.
 */
export function applyPharmaOrAutoValuation(
  model: CompanyModel,
  f: CompanyFundamentals,
  opts: { pipelineAssets?: PipelineAsset[] } = {}
): CompanyModel {
  const shares = Math.max(1, model.valuation.sharesForValuation);
  const latest = f.history.annual[f.history.annual.length - 1];
  const v = latest?.values ?? {};

  if (model.templateId === "pharma") {
    const w = Math.max(0.06, model.valuation.wacc);
    const tax = model.assumptions.drivers.taxRate[0] ?? 0.2;

    // If explicit pipeline assets are provided, price them directly; otherwise derive an R&D-grounded
    // late-stage pipeline proxy (capitalizing Phase 2/3 pipeline from reported R&D spend).
    const assets: PipelineAsset[] =
      opts.pipelineAssets && opts.pipelineAssets.length > 0
        ? opts.pipelineAssets
        : (() => {
            const rd = v.researchAndDevelopment ?? model.base.revenue * 0.16;
            return [
              { name: "Late-Stage Phase 3 Portfolio (R&D-implied)", phase: "phase3", peakSales: rd * 1.4, yearsToLaunch: 2 },
              { name: "Mid-Stage Phase 2 Portfolio (R&D-implied)", phase: "phase2", peakSales: rd * 1.8, yearsToLaunch: 4 },
            ];
          })();

    const pipelineRnpv = computePipelineRnpv(assets, w, tax);
    const pipelinePerShare = pipelineRnpv / shares;
    // Commercial DCF already embeds some reinvestment; add incremental net pipeline value (50% credit to avoid double-counting)
    const incrementalPipelinePerShare = pipelinePerShare * 0.5;
    const totalValuePerShare = model.valuation.valuePerShare + incrementalPipelinePerShare;
    const scale = model.valuation.valuePerShare > 0 ? totalValuePerShare / model.valuation.valuePerShare : 1;

    const sectorValuation: SectorValuationDetail = {
      method: "pharma-rnpv-blend",
      label: "Pharma Commercial DCF + Pipeline rNPV",
      summary: `Commercial DCF ${model.currency} ${model.valuation.valuePerShare.toFixed(2)}/sh + Incremental Pipeline rNPV ${model.currency} ${incrementalPipelinePerShare.toFixed(2)}/sh (${assets.length} asset tranches).`,
      metrics: {
        commercialDcfPerShare: Number(model.valuation.valuePerShare.toFixed(2)),
        grossPipelineRnpvPerShare: Number(pipelinePerShare.toFixed(2)),
        incrementalPipelinePerShare: Number(incrementalPipelinePerShare.toFixed(2)),
        pipelineAssetCount: assets.length,
      },
      crossCheckValuePerShare: Number(model.valuation.valuePerShare.toFixed(2)),
    };

    return rescaleModelValue(model, totalValuePerShare, scale, sectorValuation, [
      {
        key: "pharmaPipelineRnpv",
        value: `+${model.currency} ${incrementalPipelinePerShare.toFixed(2)}/sh`,
        basis: sectorValuation.summary,
        source: "template",
      },
    ]);
  }

  if (model.templateId === "auto") {
    // Separate captive-finance debt (e.g. Ford Credit, GM Financial, Toyota Financial) from industrial debt.
    // OEMs with captive finance subsidiaries typically carry consolidated debt > 40% of revenue,
    // where the excess above ~20% of revenue is matched against customer finance receivables.
    const grossDebt = v.totalDebt ?? model.base.debt;
    const rev = Math.max(1, model.base.revenue);
    const debtToRev = grossDebt / rev;
    const captiveFinanceDebt = debtToRev > 0.35 ? grossDebt - rev * 0.2 : 0;
    const industrialDebt = grossDebt - captiveFinanceDebt;
    const industrialNetDebt = industrialDebt - (v.cash ?? 0) - (v.shortTermInvestments ?? 0) - (v.longTermInvestments ?? 0);

    // Captive finance subsidiary valued conservatively at 1.0x implied equity (~10% of captive assets)
    const fincoEquityValue = captiveFinanceDebt * 0.1;
    const adjustedEquityValue =
      model.valuation.enterpriseValue - industrialNetDebt - model.valuation.minorityAndOther + fincoEquityValue;
    const adjustedValuePerShare = adjustedEquityValue / shares;
    const scale = model.valuation.valuePerShare > 0 ? adjustedValuePerShare / model.valuation.valuePerShare : 1;

    const sectorValuation: SectorValuationDetail = {
      method: "auto-captive-split",
      label: "Auto Industrial DCF + Captive-Finance Separation",
      summary:
        captiveFinanceDebt > 0
          ? `Separated ${(captiveFinanceDebt / 1e9).toFixed(1)}B captive-finance debt from ${(industrialDebt / 1e9).toFixed(1)}B industrial debt (FinCo equity +${(fincoEquityValue / 1e9).toFixed(1)}B).`
          : `Consolidated debt (${(debtToRev * 100).toFixed(0)}% of rev) is purely industrial; no captive-finance carve-out required.`,
      metrics: {
        consolidatedDebtB: Number((grossDebt / 1e9).toFixed(2)),
        captiveFinanceDebtB: Number((captiveFinanceDebt / 1e9).toFixed(2)),
        industrialNetDebtB: Number((industrialNetDebt / 1e9).toFixed(2)),
        fincoEquityValueB: Number((fincoEquityValue / 1e9).toFixed(2)),
      },
      crossCheckValuePerShare: Number(model.valuation.valuePerShare.toFixed(2)),
    };

    const rescaled = rescaleModelValue(model, adjustedValuePerShare, scale, sectorValuation, [
      {
        key: "autoCaptiveFinanceSplit",
        value: `${(captiveFinanceDebt / 1e9).toFixed(1)}B carved out`,
        basis: sectorValuation.summary,
        source: "template",
      },
    ]);
    return {
      ...rescaled,
      valuation: {
        ...rescaled.valuation,
        netDebt: industrialNetDebt,
      },
    };
  }

  return model;
}
