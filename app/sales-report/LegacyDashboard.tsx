"use client";

import { useEffect, useState } from "react";

const SALES_REPORT_ASSETS = [
  "/sales-report/vendor/xlsx.full.min.js",
  "/sales-report/ozon-rates-default.js",
  "/sales-report/vendor/pdf.min.js",
  "/sales-report/dashboard.js"
];

let salesReportScriptsPromise: Promise<void> | undefined;

function loadSalesReportScripts() {
  if (!salesReportScriptsPromise) {
    salesReportScriptsPromise = (async () => {
      for (const source of SALES_REPORT_ASSETS) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = source;
          script.async = false;
          script.dataset.salesReportScript = "true";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error(`无法加载销售报告资源：${source}`));
          document.head.appendChild(script);
        });
      }
    })();
  }
  return salesReportScriptsPromise;
}

// The legacy report stays browser-side, but its local databases are scoped to this account.
export default function LegacyDashboard({ markup, stylesheet, accountId }: { markup: string; stylesheet: string; accountId: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.__SALES_REPORT_ACCOUNT_ID = accountId;
    if (!document.querySelector('style[data-sales-report="true"]')) {
      const style = document.createElement("style");
      style.dataset.salesReport = "true";
      style.textContent = stylesheet;
      document.head.appendChild(style);
    }

    void loadSalesReportScripts().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "销售报告初始化失败。");
    });

    return () => {
      // Re-run the legacy script when another account opens this route later in the same tab.
      salesReportScriptsPromise = undefined;
      document.querySelectorAll('script[data-sales-report-script="true"]').forEach(script => script.remove());
      document.querySelector('style[data-sales-report="true"]')?.remove();
    };
  }, [accountId, stylesheet]);

  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: markup }} />
      {error ? (
        <main className="sales-report-error" role="alert">
          <h1>销售报告暂时无法打开</h1>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>重新加载</button>
        </main>
      ) : null}
    </>
  );
}

declare global {
  interface Window {
    __SALES_REPORT_ACCOUNT_ID?: string;
  }
}
