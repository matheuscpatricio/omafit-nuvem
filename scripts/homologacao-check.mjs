#!/usr/bin/env node
const base =
	process.env.OMAFIT_HOMOLOG_BASE_URL ||
	process.env.NUVEMSHOP_APP_URL ||
	"https://omafit-nuvem-production.up.railway.app";
const storeId = process.env.OMAFIT_DEMO_STORE_ID || "6994912";
const storeUrl = process.env.OMAFIT_DEMO_STORE_URL || "arrascaneta.lojavirtualnuvem.com.br";

const url = `${base.replace(/\/+$/, "")}/api/homologacao/readiness?store_id=${encodeURIComponent(storeId)}&store_url=${encodeURIComponent(storeUrl)}`;

const response = await fetch(url);
const report = await response.json();
console.log(JSON.stringify(report, null, 2));
process.exit(report.readyForHomologation ? 0 : 1);
