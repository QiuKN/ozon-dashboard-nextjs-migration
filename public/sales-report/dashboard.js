(() => {
      'use strict';

      const TARGET_LABEL = 'Total sales (net of refunds) (CNY)';
      const $ = (selector) => document.querySelector(selector);
      const elements = {
        salesNavButton: $('#salesNavButton'),
        logisticsNavButton: $('#logisticsNavButton'),
        fbsNavButton: $('#fbsNavButton'),
        commissionNavButton: $('#commissionNavButton'),
        expenseNavButton: $('#expenseNavButton'),
        salesModule: $('#salesModule'),
        logisticsModule: $('#logisticsModule'),
        fbsModule: $('#fbsModule'),
        commissionModule: $('#commissionModule'),
        expenseModule: $('#expenseModule'),
        ozonRatesNavButton: $('#ozonRatesNavButton'),
        ozonCommissionTableModule: $('#ozonCommissionTableModule'),
        pageBreadcrumb: $('#pageBreadcrumb'),
        fileInput: $('#fileInput'),
        chooseButton: $('#chooseButton'),
        dropzone: $('#dropzone'),
        emptyState: $('#emptyState'),
        resultArea: $('#resultArea'),
        clearButton: $('#clearButton'),
        periodPill: $('#periodPill'),
        yearValue: $('#yearValue'),
        yearSub: $('#yearSub'),
        quarterValue: $('#quarterValue'),
        quarterSub: $('#quarterSub'),
        monthValue: $('#monthValue'),
        monthSub: $('#monthSub'),
        metricValue: $('#metricValue'),
        metricFoot: $('#metricFoot'),
        fileName: $('#fileName'),
        fileMeta: $('#fileMeta'),
        matchSummary: $('#matchSummary'),
        matchSub: $('#matchSub'),
        matchTableBody: $('#matchTableBody'),
        sourceNote: $('#sourceNote'),
        yearSummaryBody: $('#yearSummaryBody'),
        quarterSummaryBody: $('#quarterSummaryBody'),
        monthSummaryBody: $('#monthSummaryBody'),
        logisticsFileInput: $('#logisticsFileInput'),
        logisticsChooseButton: $('#logisticsChooseButton'),
        logisticsDropzone: $('#logisticsDropzone'),
        logisticsEmptyState: $('#logisticsEmptyState'),
        logisticsResultArea: $('#logisticsResultArea'),
        logisticsClearButton: $('#logisticsClearButton'),
        logisticsPeriodPill: $('#logisticsPeriodPill'),
        logisticsMetricValue: $('#logisticsMetricValue'),
        logisticsMetricFoot: $('#logisticsMetricFoot'),
        logisticsFileCount: $('#logisticsFileCount'),
        logisticsFileMeta: $('#logisticsFileMeta'),
        logisticsMatchSummary: $('#logisticsMatchSummary'),
        logisticsMatchSub: $('#logisticsMatchSub'),
        logisticsYearValue: $('#logisticsYearValue'),
        logisticsYearSub: $('#logisticsYearSub'),
        logisticsQuarterValue: $('#logisticsQuarterValue'),
        logisticsQuarterSub: $('#logisticsQuarterSub'),
        logisticsMonthValue: $('#logisticsMonthValue'),
        logisticsMonthSub: $('#logisticsMonthSub'),
        logisticsYearSummaryBody: $('#logisticsYearSummaryBody'),
        logisticsQuarterSummaryBody: $('#logisticsQuarterSummaryBody'),
        logisticsMonthSummaryBody: $('#logisticsMonthSummaryBody'),
        logisticsDetailBody: $('#logisticsDetailBody'),
        fbsFileInput: $('#fbsFileInput'),
        fbsChooseButton: $('#fbsChooseButton'),
        fbsDropzone: $('#fbsDropzone'),
        fbsEmptyState: $('#fbsEmptyState'),
        fbsResultArea: $('#fbsResultArea'),
        fbsClearButton: $('#fbsClearButton'),
        fbsPeriodPill: $('#fbsPeriodPill'),
        fbsMetricValue: $('#fbsMetricValue'),
        fbsMetricFoot: $('#fbsMetricFoot'),
        fbsFileCount: $('#fbsFileCount'),
        fbsFileMeta: $('#fbsFileMeta'),
        fbsMatchSummary: $('#fbsMatchSummary'),
        fbsMatchSub: $('#fbsMatchSub'),
        fbsYearValue: $('#fbsYearValue'),
        fbsYearSub: $('#fbsYearSub'),
        fbsQuarterValue: $('#fbsQuarterValue'),
        fbsQuarterSub: $('#fbsQuarterSub'),
        fbsMonthValue: $('#fbsMonthValue'),
        fbsMonthSub: $('#fbsMonthSub'),
        fbsYearSummaryBody: $('#fbsYearSummaryBody'),
        fbsQuarterSummaryBody: $('#fbsQuarterSummaryBody'),
        fbsMonthSummaryBody: $('#fbsMonthSummaryBody'),
        fbsDetailBody: $('#fbsDetailBody'),
        commissionFileInput: $('#commissionFileInput'),
        commissionChooseButton: $('#commissionChooseButton'),
        commissionDropzone: $('#commissionDropzone'),
        commissionEmptyState: $('#commissionEmptyState'),
        commissionResultArea: $('#commissionResultArea'),
        commissionClearButton: $('#commissionClearButton'),
        commissionPeriodPill: $('#commissionPeriodPill'),
        commissionMetricValue: $('#commissionMetricValue'),
        commissionMetricFoot: $('#commissionMetricFoot'),
        commissionFileCount: $('#commissionFileCount'),
        commissionFileMeta: $('#commissionFileMeta'),
        commissionMatchSummary: $('#commissionMatchSummary'),
        commissionMatchSub: $('#commissionMatchSub'),
        commissionYearValue: $('#commissionYearValue'),
        commissionYearSub: $('#commissionYearSub'),
        commissionQuarterValue: $('#commissionQuarterValue'),
        commissionQuarterSub: $('#commissionQuarterSub'),
        commissionMonthValue: $('#commissionMonthValue'),
        commissionMonthSub: $('#commissionMonthSub'),
        commissionYearSummaryBody: $('#commissionYearSummaryBody'),
        commissionQuarterSummaryBody: $('#commissionQuarterSummaryBody'),
        commissionMonthSummaryBody: $('#commissionMonthSummaryBody'),
        commissionDetailBody: $('#commissionDetailBody'),
        ozonRatesUpdated: $('#ozonRatesUpdated'),
        ozonRatesFileState: $('#ozonRatesFileState'),
        ozonRatesChooseButton: $('#ozonRatesChooseButton'),
        ozonRatesFileInput: $('#ozonRatesFileInput'),
        ozonRatesDropzone: $('#ozonRatesDropzone'),
        ozonRatesEmptyState: $('#ozonRatesEmptyState'),
        ozonRatesResultArea: $('#ozonRatesResultArea'),
        ozonRatesClearButton: $('#ozonRatesClearButton'),
        ozonRatesSourceMeta: $('#ozonRatesSourceMeta'),
        ozonRatesRowCount: $('#ozonRatesRowCount'),
        ozonRatesSearchInput: $('#ozonRatesSearchInput'),
        ozonRatesSheetFilter: $('#ozonRatesSheetFilter'),
        ozonRatesCategoryFilter: $('#ozonRatesCategoryFilter'),
        ozonRatesCategoryOptions: $('#ozonRatesCategoryOptions'),
        ozonRatesResetFiltersButton: $('#ozonRatesResetFiltersButton'),
        ozonRatesTableHead: $('#ozonRatesTableHead'),
        ozonRatesTableBody: $('#ozonRatesTableBody'),
        ozonRatesPageInfo: $('#ozonRatesPageInfo'),
        ozonRatesPrevButton: $('#ozonRatesPrevButton'),
        ozonRatesNextButton: $('#ozonRatesNextButton'),
        expenseForm: $('#expenseForm'),
        expenseDateInput: $('#expenseDateInput'),
        expenseTitleInput: $('#expenseTitleInput'),
        expenseAmountInput: $('#expenseAmountInput'),
        expenseNoteInput: $('#expenseNoteInput'),
        expenseEmptyState: $('#expenseEmptyState'),
        expenseResultArea: $('#expenseResultArea'),
        expenseClearButton: $('#expenseClearButton'),
        expensePeriodPill: $('#expensePeriodPill'),
        expenseMetricValue: $('#expenseMetricValue'),
        expenseMetricFoot: $('#expenseMetricFoot'),
        expenseCountValue: $('#expenseCountValue'),
        expenseRangeValue: $('#expenseRangeValue'),
        expenseYearSummaryBody: $('#expenseYearSummaryBody'),
        expenseQuarterSummaryBody: $('#expenseQuarterSummaryBody'),
        expenseMonthSummaryBody: $('#expenseMonthSummaryBody'),
        expenseDetailBody: $('#expenseDetailBody'),
        profitModule: $('#profitModule'),
        profitStandardPanel: $('#profitStandardPanel'),
        profitNavButton: $('#profitNavButton'),
        profitProductName: $('#profitProductName'),
        profitSellingPriceRmb: $('#profitSellingPriceRmb'),
        profitSellingPriceRubHint: $('#profitSellingPriceRubHint'),
        profitLength: $('#profitLength'),
        profitWidth: $('#profitWidth'),
        profitHeight: $('#profitHeight'),
        profitActualWeight: $('#profitActualWeight'),
        profitProductCost: $('#profitProductCost'),
        profitCommissionRate: $('#profitCommissionRate'),
        profitAdCost: $('#profitAdCost'),
        profitOtherCost: $('#profitOtherCost'),
        profitExchangeRate: $('#profitExchangeRate'),
        profitRefreshRateButton: $('#profitRefreshRateButton'),
        profitRateStatus: $('#profitRateStatus'),
        profitRouteMode: $('#profitRouteMode'),
        profitTargetProfit: $('#profitTargetProfit'),
        profitExampleButton: $('#profitExampleButton'),
        profitStatusBadge: $('#profitStatusBadge'),
        profitValue: $('#profitValue'),
        profitMarginValue: $('#profitMarginValue'),
        profitRevenueValue: $('#profitRevenueValue'),
        profitCommissionValue: $('#profitCommissionValue'),
        profitShippingValue: $('#profitShippingValue'),
        profitTotalCostValue: $('#profitTotalCostValue'),
        profitRouteValue: $('#profitRouteValue'),
        profitChargeableWeightValue: $('#profitChargeableWeightValue'),
        profitRouteMessage: $('#profitRouteMessage'),
        profitProductCostValue: $('#profitProductCostValue'),
        profitAdCostValue: $('#profitAdCostValue'),
        profitOtherCostValue: $('#profitOtherCostValue'),
        profitAcquiringFeeValue: $('#profitAcquiringFeeValue'),
        profitExpensesValue: $('#profitExpensesValue'),
        profitWarningBox: $('#profitWarningBox'),
        profitRecommendedPriceValue: $('#profitRecommendedPriceValue'),
        profitTargetResultMessage: $('#profitTargetResultMessage'),
        profitCopyButton: $('#profitCopyButton'),
        profitCopyFeedback: $('#profitCopyFeedback'),
        oglModule: $('#oglModule'),
        oglNavButton: $('#oglNavButton'),
        oglProductName: $('#oglProductName'),
        oglSellingPriceRmb: $('#oglSellingPriceRmb'),
        oglSellingPriceRubHint: $('#oglSellingPriceRubHint'),
        oglLength: $('#oglLength'),
        oglWidth: $('#oglWidth'),
        oglHeight: $('#oglHeight'),
        oglActualWeight: $('#oglActualWeight'),
        oglProductCost: $('#oglProductCost'),
        oglCommissionRate: $('#oglCommissionRate'),
        oglAdCost: $('#oglAdCost'),
        oglOtherCost: $('#oglOtherCost'),
        oglExchangeRateValue: $('#oglExchangeRateValue'),
        oglRateStatus: $('#oglRateStatus'),
        oglRouteMode: $('#oglRouteMode'),
        oglTargetProfit: $('#oglTargetProfit'),
        oglExampleButton: $('#oglExampleButton'),
        oglStatusBadge: $('#oglStatusBadge'),
        oglProfitValue: $('#oglProfitValue'),
        oglProfitMarginValue: $('#oglProfitMarginValue'),
        oglRevenueValue: $('#oglRevenueValue'),
        oglCommissionValue: $('#oglCommissionValue'),
        oglShippingValue: $('#oglShippingValue'),
        oglTotalCostValue: $('#oglTotalCostValue'),
        oglRouteValue: $('#oglRouteValue'),
        oglChargeableWeightValue: $('#oglChargeableWeightValue'),
        oglRouteMessage: $('#oglRouteMessage'),
        oglProductCostValue: $('#oglProductCostValue'),
        oglAdCostValue: $('#oglAdCostValue'),
        oglOtherCostValue: $('#oglOtherCostValue'),
        oglLogisticsPlatformFeeValue: $('#oglLogisticsPlatformFeeValue'),
        oglTransportContractFeeValue: $('#oglTransportContractFeeValue'),
        oglStarAdsFeeValue: $('#oglStarAdsFeeValue'),
        oglAcquiringFeeValue: $('#oglAcquiringFeeValue'),
        oglExpensesValue: $('#oglExpensesValue'),
        oglWarningBox: $('#oglWarningBox'),
        oglRecommendedPriceValue: $('#oglRecommendedPriceValue'),
        oglTargetResultMessage: $('#oglTargetResultMessage'),
        oglCopyButton: $('#oglCopyButton'),
        oglCopyFeedback: $('#oglCopyFeedback'),
        toast: $('#toast')
      };

      const state = { toastTimer: null, reports: [], importRevision: 0, databasePromise: null, logisticsReports: [], logisticsImportRevision: 0, logisticsDatabasePromise: null, fbsReports: [], fbsImportRevision: 0, fbsDatabasePromise: null, commissionReports: [], commissionImportRevision: 0, commissionDatabasePromise: null, expenseReports: [], expenseImportRevision: 0, expenseDatabasePromise: null, ozonRatesDatabasePromise: null, ozonRatesDataset: null, ozonRatesSheetName: '', ozonRatesImportRevision: 0, ozonRatesPage: 0, ozonRatesSearch: '', ozonRatesCategory: '', profitRateState: { source: '备用汇率', updatedAt: '尚未更新', loading: false }, profitHasUserEditedPrice: false, oglHasUserEditedPrice: false };
      const DATABASE_NAME = 'sales-report-dashboard';
      const DATABASE_VERSION = 1;
      const REPORT_STORE = 'reports';
      const LOGISTICS_DATABASE_NAME = 'logistics-cost-dashboard';
      const FBS_DATABASE_NAME = 'fbs-shipping-dashboard';
      const COMMISSION_DATABASE_NAME = 'standard-commission-dashboard';
      const EXPENSE_DATABASE_NAME = 'manual-expense-dashboard';
      const OZON_RATES_DATABASE_NAME = 'ozon-commission-rates';
      const OZON_RATES_STORE = 'rates';
      const OZON_RATES_PAGE_SIZE = 50;
      // Scope browser databases to the signed-in account because IndexedDB is shared by the whole origin.
      const ACCOUNT_SCOPE = String(window.__SALES_REPORT_ACCOUNT_ID || 'guest').replace(/[^a-zA-Z0-9_-]/g, '_');
      const scopedDatabaseName = (name) => `${name}-${ACCOUNT_SCOPE}`;
      const targetKey = normalizeLabel(TARGET_LABEL);

      if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/sales-report/vendor/pdf.worker.min.js';

      function openLocalDatabase(databaseName, storeName) {
        return new Promise((resolve, reject) => {
          if (!window.indexedDB) {
            reject(new Error('当前浏览器不支持本地数据库。'));
            return;
          }
          const request = window.indexedDB.open(databaseName, 1);
          request.onupgradeneeded = () => {
            const database = request.result;
            if (!database.objectStoreNames.contains(storeName)) {
              database.createObjectStore(storeName, { keyPath: 'id' });
            }
          };
          request.onsuccess = () => {
            const database = request.result;
            database.onversionchange = () => database.close();
            resolve(database);
          };
          request.onerror = () => reject(request.error || new Error('本地数据库打开失败。'));
          request.onblocked = () => reject(new Error('本地数据库正在被其他页面占用，请关闭重复打开的报告页后重试。'));
        });
      }

      function openReportDatabase() {
        return openLocalDatabase(scopedDatabaseName(DATABASE_NAME), REPORT_STORE);
      }

      function openLogisticsDatabase() {
        return openLocalDatabase(scopedDatabaseName(LOGISTICS_DATABASE_NAME), REPORT_STORE);
      }

      function openFbsDatabase() {
        return openLocalDatabase(scopedDatabaseName(FBS_DATABASE_NAME), REPORT_STORE);
      }

      function openCommissionDatabase() {
        return openLocalDatabase(scopedDatabaseName(COMMISSION_DATABASE_NAME), REPORT_STORE);
      }

      function openExpenseDatabase() {
        return openLocalDatabase(scopedDatabaseName(EXPENSE_DATABASE_NAME), REPORT_STORE);
      }

      function openOzonRatesDatabase() {
        return openLocalDatabase(scopedDatabaseName(OZON_RATES_DATABASE_NAME), OZON_RATES_STORE);
      }

      function readStoredReports(database, storeName = REPORT_STORE) {
        return new Promise((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readonly');
          const request = transaction.objectStore(storeName).getAll();
          request.onsuccess = () => resolve(request.result.sort((a, b) => (a.importedAt || 0) - (b.importedAt || 0)));
          request.onerror = () => reject(request.error || new Error('读取本地报告失败。'));
          transaction.onerror = () => reject(transaction.error || new Error('读取本地报告失败。'));
        });
      }

      function storeReports(database, reports, storeName = REPORT_STORE) {
        return new Promise((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          reports.forEach((report) => store.put(report));
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error('保存报告到本地失败。'));
          transaction.onabort = () => reject(transaction.error || new Error('保存报告到本地失败。'));
        });
      }

      function clearStoredReports(database, storeName = REPORT_STORE) {
        return new Promise((resolve, reject) => {
          const transaction = database.transaction(storeName, 'readwrite');
          transaction.objectStore(storeName).clear();
          transaction.oncomplete = resolve;
          transaction.onerror = () => reject(transaction.error || new Error('删除本地报告失败。'));
          transaction.onabort = () => reject(transaction.error || new Error('删除本地报告失败。'));
        });
      }

      async function initializeReports() {
        try {
          const database = await openReportDatabase();
          const reports = await readStoredReports(database);
          state.reports = reports;
          if (reports.length) {
            renderDashboard();
            showToast(`已从本地恢复 ${reports.length} 份报告。`);
          }
          return database;
        } catch (error) {
          showToast(`无法启用本地保存：${error.message} 刷新页面后，未保存的数据可能丢失。`);
          return null;
        }
      }

      async function initializeLogisticsReports() {
        const importRevision = state.logisticsImportRevision;
        try {
          const database = await openLogisticsDatabase();
          const reports = await readStoredReports(database);
          if (importRevision !== state.logisticsImportRevision) return database;
          state.logisticsReports = reports;
          if (reports.length) {
            renderLogisticsDashboard();
            showToast(`已从本地恢复 ${reports.length} 份物流账单。`);
          }
          return database;
        } catch (error) {
          showToast(`物流费本地保存不可用：${error.message} 刷新页面后，未保存的账单可能丢失。`);
          return null;
        }
      }

      async function initializeFbsReports() {
        const importRevision = state.fbsImportRevision;
        try {
          const database = await openFbsDatabase();
          const reports = await readStoredReports(database);
          if (importRevision !== state.fbsImportRevision) return database;
          state.fbsReports = reports.map(normalizeFbsReport);
          if (reports.length) {
            renderFbsDashboard();
            showToast(`已从本地恢复 ${reports.length} 份 FBS 运费账单。`);
          }
          return database;
        } catch (error) {
          showToast(`FBS运费本地保存不可用：${error.message} 刷新页面后，未保存的账单可能丢失。`);
          return null;
        }
      }

      async function initializeCommissionReports() {
        const importRevision = state.commissionImportRevision;
        try {
          const database = await openCommissionDatabase();
          const reports = await readStoredReports(database);
          if (importRevision !== state.commissionImportRevision) return database;
          state.commissionReports = reports.map(normalizeFbsReport);
          if (reports.length) {
            renderCommissionDashboard();
            showToast(`已从本地恢复 ${reports.length} 份佣金账单。`);
          }
          return database;
        } catch (error) {
          showToast(`佣金本地保存不可用：${error.message} 刷新页面后，未保存的账单可能丢失。`);
          return null;
        }
      }

      async function initializeExpenseReports() {
        const importRevision = state.expenseImportRevision;
        try {
          const database = await openExpenseDatabase();
          const reports = await readStoredReports(database);
          if (importRevision !== state.expenseImportRevision) return database;
          state.expenseReports = reports;
          if (reports.length) renderExpenseDashboard();
          return database;
        } catch (error) {
          showToast(`支出数据本地保存不可用：${error.message} 刷新页面后，未保存的数据可能丢失。`);
          return null;
        }
      }

      async function loadOzonDefaultRates() {
        const encoded = window.OZON_RATES_DEFAULT_GZIP;
        if (!encoded || typeof DecompressionStream === 'undefined') return null;
        const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        const dataset = JSON.parse(await new Response(stream).text());
        return { ...dataset, id: 'current', isDefault: true };
      }

      async function initializeOzonRates() {
        const importRevision = state.ozonRatesImportRevision;
        let database = null;
        let stored = [];
        try {
          database = await openOzonRatesDatabase();
          stored = await readStoredReports(database, OZON_RATES_STORE);
        } catch (error) {
          showToast(`Ozon佣金表本地保存不可用：${error.message} 刷新页面后，未保存的数据可能丢失。`);
        }
        if (importRevision !== state.ozonRatesImportRevision) return database;
        state.ozonRatesDataset = stored.find((item) => item.id === 'current') || await loadOzonDefaultRates();
        state.ozonRatesSheetName = '';
        renderOzonRatesTable();
        return database;
      }

      function normalizeLabel(value) {
        return String(value ?? '')
          .replace(/\u00a0/g, ' ')
          .replace(/[：:]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
      }

      function parseNumber(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : null;
        if (value === null || value === undefined) return null;
        const raw = String(value).trim();
        if (!raw || !/[\d]/.test(raw)) return null;
        const negative = /^\s*-/.test(raw) || /^\s*\(.*\)\s*$/.test(raw);
        let text = raw.replace(/[^\d.,]/g, '');
        if (!text) return null;
        const comma = text.lastIndexOf(',');
        const dot = text.lastIndexOf('.');
        if (comma >= 0 && dot >= 0) {
          const decimal = comma > dot ? ',' : '.';
          const thousands = decimal === ',' ? '.' : ',';
          text = text.split(thousands).join('');
          text = text.replace(decimal, '.');
        } else if (comma >= 0 || dot >= 0) {
          const separator = comma >= 0 ? ',' : '.';
          const pieces = text.split(separator);
          const last = pieces[pieces.length - 1];
          if (pieces.length > 2 || last.length === 3) {
            text = pieces.join('');
          } else {
            text = pieces.slice(0, -1).join('') + '.' + last;
          }
        }
        const number = Number(text);
        if (!Number.isFinite(number)) return null;
        return negative ? -Math.abs(number) : number;
      }

      function columnName(index) {
        let result = '';
        let current = index + 1;
        while (current > 0) {
          const remainder = (current - 1) % 26;
          result = String.fromCharCode(65 + remainder) + result;
          current = Math.floor((current - 1) / 26);
        }
        return result;
      }

      function cellAddress(rowIndex, colIndex) {
        return columnName(colIndex) + String(rowIndex + 1);
      }

      function formatMoney(value) {
        return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
      }

      function formatBytes(bytes) {
        if (!bytes) return '0 KB';
        if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }

      function escapeHTML(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      function ozonText(value) {
        return String(value ?? '').replace(/\s+/g, ' ').trim();
      }

      function ozonCategoryColumnIndex(headers) {
        const preferredPattern = /main\s*categor|category\s*name|categor.{0,12}(?:name|label)|主商品分类|商品.{0,8}分类(?!码|代码)|类目名称|分类名称|категор.{0,12}(?:назван|наимен)|категор(?:ия)?\s+товара/i;
        const categoryPattern = /category|categor|product\s*(type\s*)?category|商品.{0,8}分类|主商品分类|子类|类目|分类|категор|товарн.{0,12}категор/i;
        const preferredIndex = headers.findIndex((header) => preferredPattern.test(header));
        if (preferredIndex >= 0) return preferredIndex;
        const plainIndex = headers.findIndex((header) => categoryPattern.test(header) && !/(?:\bid\b|\bcode\b|код|码|编号)/i.test(header));
        return plainIndex >= 0 ? plainIndex : headers.findIndex((header) => categoryPattern.test(header));
      }

      function ozonFindHeader(rows) {
        const categoryPattern = /category|categor|product\s*(type\s*)?category|商品.{0,8}分类|主商品分类|子类|类目|分类|категор|товарн.{0,12}категор/i;
        const ratePattern = /commission|комисс|佣金|费率|тариф|ставк.{0,10}(комисс|продаж)|tariff/i;
        let best = null;
        const scanLimit = Math.min(rows.length, 40);
        for (let rowIndex = 0; rowIndex < scanLimit; rowIndex += 1) {
          const row = rows[rowIndex] || [];
          if (row.filter((value) => ozonText(value)).length < 2) continue;
          const headers = row.map((_, columnIndex) => {
            const parts = [];
            for (let parentIndex = Math.max(0, rowIndex - 2); parentIndex <= rowIndex; parentIndex += 1) {
              const part = ozonText(rows[parentIndex]?.[columnIndex]);
              if (part && !parts.includes(part)) parts.push(part);
            }
            return parts.join(' / ');
          });
          const categoryIndex = ozonCategoryColumnIndex(headers);
          const rateIndex = headers.findIndex((header) => ratePattern.test(header));
          if (categoryIndex < 0 || rateIndex < 0) continue;
          const currentCategoryMatch = row.some((value) => categoryPattern.test(ozonText(value)));
          const currentRateMatch = row.some((value) => ratePattern.test(ozonText(value)));
          const compositeRateCount = headers.filter((header) => ratePattern.test(header)).length;
          const score = row.filter((value) => ozonText(value)).length + (currentCategoryMatch ? 4 : 0) + (currentRateMatch ? 8 : 0) + compositeRateCount * 2 - rowIndex * 0.01;
          if (!best || score > best.score) best = { rowIndex, headers, categoryIndex, score };
        }
        return best;
      }

      function ozonRatesDisplayColumns(sheetName, headers) {
        if (/^MP Tree Tarifs CN$/i.test(sheetName) && headers.length >= 12) {
          return { headers: ['大类（俄文）', '大类（英文）', '大类（中文）', '商品类目（俄文）', '商品类目（英文）', '商品类目（中文）', 'RFBS｜0–1,500 ₽', 'RFBS｜1,500.01–5,000 ₽', 'RFBS｜5,000.01 ₽以上', 'FBP｜0–1,500 ₽', 'FBP｜1,500.01–5,000 ₽', 'FBP｜5,000.01 ₽以上'], categoryIndex: 5 };
        }
        if (/^Full ChinaHK$/i.test(sheetName) && headers.length >= 16) {
          return { headers: ['商品类型（俄文）', '商品类型（中文）', '商品类型（英文）', '细分类目（俄文）', '细分类目（中文）', '细分类目（英文）', '平台类目（俄文）', '平台类目（中文）', '平台类目（英文）', '品牌', 'RFBS｜0–1,500 ₽', 'RFBS｜1,500.01–5,000 ₽', 'RFBS｜5,000.01 ₽以上', 'FBP｜0–1,500 ₽', 'FBP｜1,500.01–5,000 ₽', 'FBP｜5,000.01 ₽以上'], categoryIndex: 7 };
        }
        return { headers: headers.map((header) => header.replace(/\s*->\s*/g, ' / ').replace(/\s*Тариф\s*,?\s*%/i, '费率 %')), categoryIndex: ozonCategoryColumnIndex(headers) };
      }

      function getOzonRateSheets(dataset) {
        if (Array.isArray(dataset?.sheets) && dataset.sheets.length) return dataset.sheets;
        if (Array.isArray(dataset?.headers) && Array.isArray(dataset?.rows)) {
          return [{ sheetName: '费率表', headers: dataset.headers, categoryIndex: dataset.categoryIndex, rows: dataset.rows.map((row) => row.cells || row) }];
        }
        return [];
      }

      function getOzonActiveSheet(dataset = state.ozonRatesDataset) {
        const sheets = getOzonRateSheets(dataset);
        const active = sheets.find((sheet) => sheet.sheetName === state.ozonRatesSheetName) || sheets[0] || null;
        if (active) state.ozonRatesSheetName = active.sheetName;
        return active;
      }

      function parseOzonRateFile(file) {
        return new Promise((resolve, reject) => {
          const extension = file.name.split('.').pop().toLowerCase();
          if (!['xlsx', 'xls', 'csv'].includes(extension)) {
            reject(new Error('仅支持 .xlsx、.xls 或 .csv 文件。'));
            return;
          }
          if (typeof XLSX === 'undefined') {
            reject(new Error('Excel 解析组件未加载，请检查 vendor/xlsx.full.min.js。'));
            return;
          }
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array', cellDates: true });
              const parsedSheets = [];
              const applicableFrom = workbook.SheetNames
                .map((sheetName) => XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false })[0] || [])
                .flat()
                .map(ozonText)
                .map((value) => value.match(/starts\s+from\s+(.+)/i)?.[1] || '')
                .find(Boolean) || '';
              workbook.SheetNames.forEach((sheetName) => {
                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
                const header = ozonFindHeader(rows);
                if (!header) return;
                const originalHeaders = header.headers.map((value, index) => ozonText(value) || `字段${index + 1}`);
                const display = ozonRatesDisplayColumns(sheetName, originalHeaders);
                const headers = display.headers;
                const dataRows = rows.slice(header.rowIndex + 1)
                  .map((row) => headers.map((_, index) => ozonText(row[index])))
                  .filter((row) => row.some(Boolean))
                  .filter((row) => !row.every((value, index) => value === originalHeaders[index]));
                if (dataRows.length) parsedSheets.push({ sheetName, headers, categoryIndex: display.categoryIndex, rows: dataRows });
              });
              if (!parsedSheets.length) throw new Error('未识别到同时含有类目和佣金费率字段的表头。请导入 Ozon 卖家中心导出的佣金表。');
              resolve({
                id: 'current',
                fileName: file.name,
                importedAt: Date.now(),
                applicableFrom,
                sheetCount: parsedSheets.length,
                rowCount: parsedSheets.reduce((sum, sheet) => sum + sheet.rows.length, 0),
                sheets: parsedSheets
              });
            } catch (error) {
              reject(new Error(`${file.name}：${error.message || '解析失败'}`));
            }
          };
          reader.onerror = () => reject(new Error(`${file.name}：文件读取失败。`));
          reader.readAsArrayBuffer(file);
        });
      }

      function getOzonFilteredRows() {
        const dataset = state.ozonRatesDataset;
        const sheet = getOzonActiveSheet(dataset);
        if (!sheet) return [];
        const search = state.ozonRatesSearch.toLocaleLowerCase();
        const categoryQuery = state.ozonRatesCategory.toLocaleLowerCase();
        return sheet.rows.filter((row) => {
          if (categoryQuery && !String(row[sheet.categoryIndex] ?? '').toLocaleLowerCase().includes(categoryQuery)) return false;
          return !search || row.join(' ').toLocaleLowerCase().includes(search);
        });
      }

      function renderOzonRatesTable() {
        const dataset = state.ozonRatesDataset;
        const sheets = getOzonRateSheets(dataset);
        if (!dataset || !sheets.length) {
          elements.ozonRatesResultArea.classList.remove('visible');
          elements.ozonRatesEmptyState.style.display = 'grid';
          elements.ozonRatesUpdated.textContent = '等待导入费率表';
          elements.ozonRatesSourceMeta.textContent = '—';
          elements.ozonRatesRowCount.textContent = '—';
          elements.ozonRatesSheetFilter.innerHTML = '';
          elements.ozonRatesCategoryFilter.value = '';
          elements.ozonRatesCategoryOptions.innerHTML = '';
          elements.ozonRatesPageInfo.textContent = '—';
          elements.ozonRatesPrevButton.disabled = true;
          elements.ozonRatesNextButton.disabled = true;
          elements.ozonRatesTableHead.innerHTML = '';
          elements.ozonRatesTableBody.innerHTML = '';
          return;
        }
        elements.ozonRatesEmptyState.style.display = 'none';
        elements.ozonRatesResultArea.classList.add('visible');
        const activeSheet = getOzonActiveSheet(dataset);
        elements.ozonRatesUpdated.textContent = dataset.applicableFrom ? `适用起始日 ${dataset.applicableFrom}` : `导入于 ${new Date(dataset.importedAt).toLocaleString('zh-CN')}`;
        elements.ozonRatesSourceMeta.textContent = `${dataset.fileName} · ${activeSheet.sheetName}`;
        elements.ozonRatesFileState.textContent = dataset.isDefault ? '内置费率' : '已导入';
        elements.ozonRatesSheetFilter.innerHTML = sheets.map((sheet) => `<option value="${escapeHTML(sheet.sheetName)}">${escapeHTML(sheet.sheetName)}</option>`).join('');
        elements.ozonRatesSheetFilter.value = activeSheet.sheetName;
        elements.ozonRatesTableHead.innerHTML = `<tr>${activeSheet.headers.map((header) => `<th>${escapeHTML(header)}</th>`).join('')}</tr>`;

        const categoryValues = activeSheet.categoryIndex >= 0
          ? [...new Set(activeSheet.rows.map((row) => row[activeSheet.categoryIndex]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
          : [];
        const priorCategory = state.ozonRatesCategory;
        elements.ozonRatesCategoryOptions.innerHTML = categoryValues.map((value) => `<option value="${escapeHTML(value)}"></option>`).join('');
        state.ozonRatesCategory = priorCategory;
        elements.ozonRatesCategoryFilter.value = state.ozonRatesCategory;

        const filtered = getOzonFilteredRows();
        const pageCount = Math.max(1, Math.ceil(filtered.length / OZON_RATES_PAGE_SIZE));
        state.ozonRatesPage = Math.min(state.ozonRatesPage, pageCount - 1);
        const start = state.ozonRatesPage * OZON_RATES_PAGE_SIZE;
        const visibleRows = filtered.slice(start, start + OZON_RATES_PAGE_SIZE);
        elements.ozonRatesRowCount.textContent = `${filtered.length.toLocaleString('zh-CN')} / ${activeSheet.rows.length.toLocaleString('zh-CN')} 条`;
        elements.ozonRatesPageInfo.textContent = `${filtered.length ? start + 1 : 0}–${Math.min(start + OZON_RATES_PAGE_SIZE, filtered.length)} / ${filtered.length} 条 · ${state.ozonRatesPage + 1} / ${pageCount} 页`;
        elements.ozonRatesPrevButton.disabled = state.ozonRatesPage === 0;
        elements.ozonRatesNextButton.disabled = state.ozonRatesPage >= pageCount - 1;
        elements.ozonRatesTableBody.innerHTML = visibleRows.length
          ? visibleRows.map((row) => `<tr>${row.map((value) => `<td>${escapeHTML(value)}</td>`).join('')}</tr>`).join('')
          : `<tr><td class="summary-empty" colspan="${activeSheet.headers.length}">没有符合条件的佣金费率</td></tr>`;
      }

      async function handleOzonRatesFile(file) {
        if (!file) return;
        const importRevision = ++state.ozonRatesImportRevision;
        try {
          const dataset = await parseOzonRateFile(file);
          if (importRevision !== state.ozonRatesImportRevision) return;
          const database = await state.ozonRatesDatabasePromise;
          if (importRevision !== state.ozonRatesImportRevision) return;
          let warning = '';
          if (database) {
            try { await storeReports(database, [dataset], OZON_RATES_STORE); }
            catch { warning = '本地保存失败，刷新页面后费率表可能丢失。'; }
          } else warning = '本地保存不可用，刷新页面后费率表可能丢失。';
          if (importRevision !== state.ozonRatesImportRevision) return;
          state.ozonRatesDataset = dataset;
          state.ozonRatesPage = 0;
          state.ozonRatesSearch = '';
          state.ozonRatesCategory = '';
          state.ozonRatesSheetName = dataset.sheets[0]?.sheetName || '';
          elements.ozonRatesSearchInput.value = '';
          elements.ozonRatesFileInput.value = '';
          renderOzonRatesTable();
          showToast(warning || `已导入 ${(dataset.rowCount || 0).toLocaleString('zh-CN')} 条 Ozon 佣金费率。`);
        } catch (error) {
          elements.ozonRatesFileInput.value = '';
          showToast(error.message || 'Ozon佣金表导入失败。');
        }
      }

      async function clearOzonRates() {
        const clearRevision = ++state.ozonRatesImportRevision;
        state.ozonRatesPage = 0;
        state.ozonRatesSearch = '';
        state.ozonRatesCategory = '';
        elements.ozonRatesSearchInput.value = '';
        elements.ozonRatesFileInput.value = '';
        try {
          const database = await state.ozonRatesDatabasePromise;
          if (clearRevision !== state.ozonRatesImportRevision) return;
          if (database) await clearStoredReports(database, OZON_RATES_STORE);
          state.ozonRatesDataset = await loadOzonDefaultRates();
          state.ozonRatesSheetName = '';
          renderOzonRatesTable();
          showToast('已恢复内置 Ozon 佣金费率表。');
        } catch {
          if (clearRevision === state.ozonRatesImportRevision) showToast('恢复内置 Ozon 佣金费率表失败。');
        }
      }

      function showToast(message) {
        elements.toast.textContent = message;
        elements.toast.classList.add('show');
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 4200);
      }

      function parseDateToken(token) {
        const parts = String(token).split(/[./-]/).map(Number);
        if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
        if (String(token).split(/[./-]/)[0].length === 4) {
          return { year: parts[0], month: parts[1], day: parts[2] };
        }
        return { year: parts[2], month: parts[1], day: parts[0] };
      }

      function formatDateToken(date) {
        return `${date.year}.${String(date.month).padStart(2, '0')}.${String(date.day).padStart(2, '0')}`;
      }

      function localDateInputValue(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      }

      function getDateTokens(text) {
        const tokenPattern = /(?<!\d)(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})(?!\d)/g;
        return [...String(text).matchAll(tokenPattern)]
          .map((match) => parseDateToken(match[1]))
          .filter((date) => date && date.year >= 2000 && date.year <= 2200 && date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= 31);
      }

      function inferPeriodMeta(allRows, fileName) {
        const topRows = allRows.slice(0, 15);
        const contextCells = topRows.flat().filter((cell) => typeof cell === 'string' && cell.trim() && /report|resulting|rendering|services|period|invoice|billing|statement|logistic|shipping|payment|payout|settlement|commission|\bfbs\b|date|销售报告|報告|物流|运费|佣金|账单|结算|日期|отчет|отч[её]т/i.test(cell));
        const explicitPeriodCells = contextCells.filter((cell) => /\bfrom\b[\s\S]*\bto\b/i.test(cell) || /从[\s\S]*(?:至|到)/.test(cell));
        const periodDates = explicitPeriodCells.flatMap((cell) => getDateTokens(cell));
        const dates = periodDates.length >= 2 ? periodDates : contextCells.flatMap((cell) => getDateTokens(cell));
        const filenameDate = String(fileName).match(/(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)/);
        if (filenameDate) dates.push({ year: Number(filenameDate[1]), month: Number(filenameDate[2]), day: Number(filenameDate[3]) });
        const uniqueDates = [...new Map(dates
          .filter((date) => date.year >= 2000 && date.year <= 2200 && date.month >= 1 && date.month <= 12 && date.day >= 1 && date.day <= 31)
          .map((date) => [`${date.year}-${date.month}-${date.day}`, date])).values()]
          .sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day);
        if (!uniqueDates.length) {
          return {
            rangeLabel: '报告期间未识别',
            start: null, end: null, sameYear: false, sameQuarter: false, sameMonth: false,
            yearLabel: '—', yearSub: '未读取到报告日期',
            quarterLabel: '—', quarterSub: '未读取到报告日期',
            monthLabel: '—', monthSub: '未读取到报告日期'
          };
        }

        const start = uniqueDates[0];
        const end = uniqueDates[uniqueDates.length - 1];
        const startQuarter = Math.floor((start.month - 1) / 3) + 1;
        const endQuarter = Math.floor((end.month - 1) / 3) + 1;
        const sameYear = start.year === end.year;
        const sameQuarter = sameYear && startQuarter === endQuarter;
        const sameMonth = sameYear && start.month === end.month;
        const quarterNames = ['一', '二', '三', '四'];
        const yearLabel = sameYear ? `${start.year}年` : `${start.year}年–${end.year}年`;
        const quarterLabel = sameQuarter ? `Q${startQuarter}` : `Q${startQuarter} → Q${endQuarter}`;
        const quarterSub = sameQuarter ? `${start.year}年${quarterNames[startQuarter - 1]}季度` : `${formatDateToken(start)} 至 ${formatDateToken(end)}`;
        const monthLabel = sameMonth ? `${start.year}年${String(start.month).padStart(2, '0')}月` : `${start.year}.${String(start.month).padStart(2, '0')} → ${end.year}.${String(end.month).padStart(2, '0')}`;
        return {
          rangeLabel: `${formatDateToken(start)} 至 ${formatDateToken(end)}`,
          start, end, sameYear, sameQuarter, sameMonth,
          yearKey: sameYear ? String(start.year) : null,
          quarterKey: sameQuarter ? `${start.year}-Q${startQuarter}` : null,
          monthKey: sameMonth ? `${start.year}-${String(start.month).padStart(2, '0')}` : null,
          yearLabel,
          yearSub: sameYear ? '明确归属的报告年度' : '报告跨年度，不能按年拆分',
          quarterLabel,
          quarterSub,
          monthLabel,
          monthSub: sameMonth ? '明确归属的报告月份' : '报告跨月份，不能按月拆分'
        };
      }

      function findMatches(workbook) {
        const matches = [];
        const sheetData = [];
        const periodRows = [];
        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
          sheetData.push({ sheetName, rowCount: rows.length });
          if (periodRows.length < 15) periodRows.push(...rows.slice(0, 15 - periodRows.length));
          rows.forEach((row, rowIndex) => {
            row.forEach((cell, colIndex) => {
              if (normalizeLabel(cell) !== targetKey) return;
              const candidates = [];
              for (let next = colIndex + 1; next < row.length; next += 1) {
                const number = parseNumber(row[next]);
                if (number !== null) candidates.push({ number, colIndex: next, raw: row[next] });
              }
              if (!candidates.length) {
                for (let previous = colIndex - 1; previous >= 0; previous -= 1) {
                  const number = parseNumber(row[previous]);
                  if (number !== null) candidates.push({ number, colIndex: previous, raw: row[previous] });
                }
              }
              if (candidates.length) {
                const selected = candidates[0];
                matches.push({
                  sheetName,
                  rowIndex,
                  colIndex,
                  valueColIndex: selected.colIndex,
                  value: selected.number,
                  rawValue: selected.raw,
                  label: cell
                });
              }
            });
          });
        });
        return { matches, sheetData, periodRows };
      }

      function isTotalLabel(value) {
        return /^(?:grand\s+)?total(?:\s*\([^)]*\))?$/.test(normalizeLabel(value));
      }

      function findFbsPaymentAmount(text) {
        const source = String(text ?? '');
        const labelPattern = /\bin\s+total\s+for\s+payment\b/i;
        const match = labelPattern.exec(source);
        if (!match) return null;
        const remainder = source.slice(match.index + match[0].length)
          .replace(/^\s*[:：=-]?\s*/, '')
          .replace(/^\s*(?:CNY|RUB|USD|EUR|GBP|TRY|KZT|€|\$|₽|₺)\s*/i, '');
        const amountPattern = /[-+]?\(?\d{1,3}(?:(?:[ \u00a0'’]\d{3})|(?:[.,]\d{3}))+(?:[.,]\d+)?\)?|[-+]?\(?\d+(?:[.,]\d+)?\)?/g;
        const amounts = [...remainder.matchAll(amountPattern)]
          .map((amount) => parseNumber(amount[0]))
          .filter((amount) => amount !== null);
        return amounts.length ? amounts[amounts.length - 1] : null;
      }

      function isFbsPaymentLabel(value) {
        return /^in\s+total\s+for\s+payment\b/i.test(String(value ?? '').replace(/\u00a0/g, ' ').trim());
      }

      function normalizeFbsPeriod(period) {
        const normalized = { ...(period || {}) };
        const anchor = normalized.end || normalized.start;
        if (anchor && Number.isFinite(anchor.year) && Number.isFinite(anchor.month)) {
          const quarter = Math.floor((anchor.month - 1) / 3) + 1;
          normalized.yearKey = normalized.yearKey || String(anchor.year);
          normalized.quarterKey = normalized.quarterKey || `${anchor.year}-Q${quarter}`;
          normalized.monthKey = normalized.monthKey || `${anchor.year}-${String(anchor.month).padStart(2, '0')}`;
          normalized.periodAssignment = normalized.sameQuarter && normalized.sameMonth
            ? '按报告期间归属'
            : '报告跨期，按结束日期归属';
        }
        return normalized;
      }

      function normalizeFbsReport(report) {
        return { ...report, period: normalizeFbsPeriod(report.period) };
      }

      function findTotalAmount(text) {
        const totalPattern = /\b(?:grand\s+)?total\b(?=\s*(?:\([^)]*\)\s*)?(?:[:：-]\s*)?(?:(?:CNY|RUB|USD|EUR|GBP|TRY|KZT|€|\$|₽|₺)\s*)?[-+\d(])/gi;
        const numberPattern = /^\s*[-+]?\(?\s*\d[\d\s,.'’]*\d\)?|^\s*[-+]?\(?\d+(?:[.,]\d+)?\)?/;
        let selected = null;
        let labelMatch;
        while ((labelMatch = totalPattern.exec(String(text))) !== null) {
          const remainder = String(text).slice(totalPattern.lastIndex)
            .replace(/^\s*\([^)]*\)\s*/, '')
            .replace(/^\s*(?:[:：]\s*)?/, '')
            .replace(/^\s*(?:CNY|RUB|USD|EUR|GBP|TRY|KZT|€|\$|₽|₺)\s*/i, '');
          const numberMatch = remainder.match(numberPattern);
          if (numberMatch) {
            const value = parseNumber(numberMatch[0]);
            if (value !== null) selected = value;
          }
        }
        return selected;
      }

      function findTotalMatches(workbook) {
        const matches = [];
        const sheetData = [];
          const periodLines = [];
        workbook.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
          sheetData.push({ sheetName, rowCount: rows.length });
          rows.forEach((row, rowIndex) => {
            const line = row.map((cell) => cell instanceof Date ? `${cell.getFullYear()}-${cell.getMonth() + 1}-${cell.getDate()}` : String(cell ?? '')).join(' ');
            if (periodLines.length < 15) periodLines.push(line);
            row.forEach((cell, colIndex) => {
              if (!isTotalLabel(cell)) return;
              let value = null;
              let valueColIndex = -1;
              for (let next = colIndex + 1; next < row.length; next += 1) {
                value = parseNumber(row[next]);
                if (value !== null) { valueColIndex = next; break; }
              }
              if (value === null) {
                for (let previous = colIndex - 1; previous >= 0; previous -= 1) {
                  value = parseNumber(row[previous]);
                  if (value !== null) { valueColIndex = previous; break; }
                }
              }
              if (value !== null) matches.push({ value, location: `${sheetName} · ${cellAddress(rowIndex, colIndex)}` });
            });
          });
        });
        return { matches, sheetData, periodLines };
      }

      function logisticsPeriodMeta(text, fileName) {
        const monthNumbers = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
        const dateText = `${text}\nReport period ${fileName}`.replace(/(\d{4})年\s*(\d{1,2})月(?:\s*(\d{1,2})日?)?/g, (_, year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day || 1).padStart(2, '0')}`)
          .replace(/(?<!\d)(20\d{2})[_-](0?[1-9]|1[0-2])[_-](0?[1-9]|[12]\d|3[01])(?!\d)/g, (_, year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
          .replace(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])([0-3]\d)(?!\d)/g, (_, year, month, day) => `${year}-${month}-${day}`)
          .replace(/(?<!\d)(20\d{2})(0[1-9]|1[0-2])(?!\d)/g, (_, year, month) => `${year}-${month}-01`)
          .replace(/(?<!\d)(20\d{2})[_-](0?[1-9]|1[0-2])(?![_-]?\d)/g, (_, year, month) => `${year}-${String(month).padStart(2, '0')}-01`)
          .replace(/(?<!\d)(20\d{2})[-/.](0?[1-9]|1[0-2])(?![-/.]\d)/g, (_, year, month) => `${year}-${String(month).padStart(2, '0')}-01`)
          .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d{2})\b/gi, (_, month, year) => `${year}-${monthNumbers[month.slice(0, 3).toLowerCase()]}-01`)
          .replace(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(20\d{2})\b/gi, (_, day, month, year) => `${year}-${monthNumbers[month.slice(0, 3).toLowerCase()]}-${String(day).padStart(2, '0')}`);
        const contextualLines = dateText.split(/\r?\n/)
          .filter((line) => /report|period|invoice|billing|statement|logistic|shipping|payment|payout|settlement|commission|\bfbs\b|date|отчет|отч[её]т|логист|доставка|период|销售报告|物流|运费|佣金|账单|结算|日期/i.test(line))
          .slice(0, 15)
          .map((line) => [line]);
        return inferPeriodMeta(contextualLines, fileName);
      }

      async function parseLogisticsExcel(file) {
        if (typeof XLSX === 'undefined') throw new Error('Excel 解析组件未加载，请检查 vendor/xlsx.full.min.js 是否存在。');
        const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
        const analysis = findTotalMatches(workbook);
        if (!analysis.matches.length) throw new Error(`未找到“Total”对应的数值。`);
        const selected = analysis.matches[analysis.matches.length - 1];
        const period = logisticsPeriodMeta(analysis.periodLines.join('\n'), file.name);
        return {
          id: `${file.name}|${file.size}|${file.lastModified}`,
          fileName: file.name,
          fileSize: file.size,
          importedAt: Date.now(),
          total: selected.value,
          location: selected.location,
          period,
          sourceType: file.name.split('.').pop().toUpperCase()
        };
      }

      async function parseLogisticsPdf(file) {
        if (!window.pdfjsLib) throw new Error('PDF 解析组件未加载，请检查 vendor/pdf.min.js 是否存在。');
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const allLines = [];
        const totalMatches = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const textContent = await page.getTextContent();
          const lines = [];
          textContent.items.filter((item) => item.str && item.str.trim()).forEach((item) => {
            const x = item.transform?.[4] ?? 0;
            const y = item.transform?.[5] ?? 0;
            let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
            if (!line) { line = { y, items: [] }; lines.push(line); }
            line.items.push({ x, text: item.str.trim() });
          });
          lines.sort((a, b) => b.y - a.y);
          lines.forEach((line) => {
            const text = line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ');
            allLines.push(text);
            const value = findTotalAmount(text);
            if (value !== null) totalMatches.push({ value, location: `第 ${pageNumber} 页` });
          });
          page.cleanup();
        }
        await pdf.destroy();
        if (!totalMatches.length) {
          if (!allLines.some((line) => line.trim())) throw new Error('PDF 中没有可提取的文字，可能是扫描件；当前版本暂不支持 OCR。');
          throw new Error('PDF 中未找到“Total”后面的数值。');
        }
        const selected = totalMatches[totalMatches.length - 1];
        return {
          id: `${file.name}|${file.size}|${file.lastModified}`,
          fileName: file.name,
          fileSize: file.size,
          importedAt: Date.now(),
          total: selected.value,
          location: selected.location,
          period: logisticsPeriodMeta(allLines.join('\n'), file.name),
          sourceType: 'PDF'
        };
      }

      async function parseLogisticsFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension === 'pdf') return parseLogisticsPdf(file);
        if (['xlsx', 'xls', 'csv'].includes(extension)) return parseLogisticsExcel(file);
        throw new Error(`${file.name}：格式不支持，请使用 .pdf、.xlsx、.xls 或 .csv。`);
      }

      async function parseFbsExcel(file) {
        if (typeof XLSX === 'undefined') throw new Error('Excel 解析组件未加载，请检查 vendor/xlsx.full.min.js 是否存在。');
        const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
        const matches = [];
        const periodLines = [];
        workbook.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
          rows.forEach((row, rowIndex) => {
            const line = row.map((cell) => cell instanceof Date ? `${cell.getFullYear()}-${cell.getMonth() + 1}-${cell.getDate()}` : String(cell ?? '')).join(' ');
            if (periodLines.length < 15) periodLines.push(line);
            row.forEach((cell, colIndex) => {
              if (!isFbsPaymentLabel(cell)) return;
              let value = findFbsPaymentAmount(cell);
              let valueColIndex = colIndex;
              if (value === null) {
                const rightValues = [];
                for (let next = colIndex + 1; next < row.length; next += 1) {
                  const candidate = parseNumber(row[next]);
                  if (candidate !== null) rightValues.push({ value: candidate, colIndex: next });
                }
                if (rightValues.length) {
                  const selected = rightValues[rightValues.length - 1];
                  value = selected.value;
                  valueColIndex = selected.colIndex;
                }
              }
              if (value === null) {
                for (let previous = colIndex - 1; previous >= 0; previous -= 1) {
                  value = parseNumber(row[previous]);
                  if (value !== null) { valueColIndex = previous; break; }
                }
              }
              if (value !== null) matches.push({ value, location: `${sheetName} · ${cellAddress(rowIndex, colIndex)}${valueColIndex === colIndex ? '' : ` → ${cellAddress(rowIndex, valueColIndex)}`}` });
            });
          });
        });
        if (!matches.length) throw new Error('未找到“In total for payment”对应的数值。');
        const selected = matches[matches.length - 1];
        return {
          id: `${file.name}|${file.size}|${file.lastModified}`,
          fileName: file.name,
          fileSize: file.size,
          importedAt: Date.now(),
          total: selected.value,
          location: selected.location,
          period: normalizeFbsPeriod(logisticsPeriodMeta(periodLines.join('\n'), file.name)),
          sourceType: file.name.split('.').pop().toUpperCase()
        };
      }

      async function parseFbsPdf(file) {
        if (!window.pdfjsLib) throw new Error('PDF 解析组件未加载，请检查 vendor/pdf.min.js 是否存在。');
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const allLines = [];
        const matches = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const textContent = await page.getTextContent();
          const lines = [];
          textContent.items.filter((item) => item.str && item.str.trim()).forEach((item) => {
            const x = item.transform?.[4] ?? 0;
            const y = item.transform?.[5] ?? 0;
            let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
            if (!line) { line = { y, items: [] }; lines.push(line); }
            line.items.push({ x, text: item.str.trim() });
          });
          lines.sort((a, b) => b.y - a.y);
          const pageLines = lines.map((line) => line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' '));
          pageLines.forEach((text) => {
            allLines.push(text);
            const value = findFbsPaymentAmount(text);
            if (value !== null) matches.push({ value, location: `第 ${pageNumber} 页` });
          });
          page.cleanup();
        }
        await pdf.destroy();
        if (!matches.length) {
          if (!allLines.some((line) => line.trim())) throw new Error('PDF 中没有可提取的文字，可能是扫描件；当前版本暂不支持 OCR。');
          throw new Error('PDF 中未找到“In total for payment”后面的数值。');
        }
        const selected = matches[matches.length - 1];
        return {
          id: `${file.name}|${file.size}|${file.lastModified}`,
          fileName: file.name,
          fileSize: file.size,
          importedAt: Date.now(),
          total: selected.value,
          location: selected.location,
          period: normalizeFbsPeriod(logisticsPeriodMeta(allLines.join('\n'), file.name)),
          sourceType: 'PDF'
        };
      }

      async function parseFbsFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension === 'pdf') return parseFbsPdf(file);
        if (['xlsx', 'xls', 'csv'].includes(extension)) return parseFbsExcel(file);
        throw new Error(`${file.name}：格式不支持，请使用 .pdf、.xlsx、.xls 或 .csv。`);
      }

      function isCommissionLabel(value) {
        return /\btotal\s+standard\s+commission\s+fee\s*,?\s*\(?\s*cny\s*\)?/i.test(String(value ?? '').replace(/\u00a0/g, ' '));
      }

      function findCommissionAmount(text) {
        const source = String(text ?? '').replace(/\u00a0/g, ' ');
        const labelPattern = /\btotal\s+standard\s+commission\s+fee\s*,?\s*\(?\s*cny\s*\)?/i;
        const match = labelPattern.exec(source);
        if (!match) return null;
        const remainder = source.slice(match.index + match[0].length)
          .replace(/^\s*[:：=-]?\s*/, '')
          .replace(/^\s*(?:CNY|RUB|USD|EUR|GBP|TRY|KZT|€|\$|₽|₺)\s*/i, '');
        const amountPattern = /[-+]?\(?\d{1,3}(?:(?:[ \u00a0'’]\d{3})|(?:[.,]\d{3}))+(?:[.,]\d+)?\)?|[-+]?\(?\d+(?:[.,]\d+)?\)?/g;
        const amounts = [...remainder.matchAll(amountPattern)]
          .map((amount) => parseNumber(amount[0]))
          .filter((amount) => amount !== null);
        return amounts.length ? amounts[amounts.length - 1] : null;
      }

      async function parseCommissionExcel(file) {
        if (typeof XLSX === 'undefined') throw new Error('Excel 解析组件未加载，请检查 vendor/xlsx.full.min.js 是否存在。');
        const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
        const matches = [];
        const periodLines = [];
        workbook.SheetNames.forEach((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: true });
          rows.forEach((row, rowIndex) => {
            const line = row.map((cell) => cell instanceof Date ? `${cell.getFullYear()}-${cell.getMonth() + 1}-${cell.getDate()}` : String(cell ?? '')).join(' ');
            if (periodLines.length < 15) periodLines.push(line);
            row.forEach((cell, colIndex) => {
              if (!isCommissionLabel(cell)) return;
              let value = findCommissionAmount(cell);
              let valueColIndex = colIndex;
              if (value === null) {
                const rightValues = [];
                for (let next = colIndex + 1; next < row.length; next += 1) {
                  const candidate = parseNumber(row[next]);
                  if (candidate !== null) rightValues.push({ value: candidate, colIndex: next });
                }
                if (rightValues.length) {
                  const selected = rightValues[rightValues.length - 1];
                  value = selected.value;
                  valueColIndex = selected.colIndex;
                }
              }
              if (value === null) {
                for (let previous = colIndex - 1; previous >= 0; previous -= 1) {
                  value = parseNumber(row[previous]);
                  if (value !== null) { valueColIndex = previous; break; }
                }
              }
              if (value !== null) matches.push({ value, location: `${sheetName} · ${cellAddress(rowIndex, colIndex)}${valueColIndex === colIndex ? '' : ` → ${cellAddress(rowIndex, valueColIndex)}`}` });
            });
          });
        });
        if (!matches.length) throw new Error('未找到“Total standard commission fee, (CNY)”对应的数值。');
        const selected = matches[matches.length - 1];
        return {
          id: `${file.name}|${file.size}|${file.lastModified}`,
          fileName: file.name,
          fileSize: file.size,
          importedAt: Date.now(),
          total: selected.value,
          location: selected.location,
          period: normalizeFbsPeriod(logisticsPeriodMeta(periodLines.join('\n'), file.name)),
          sourceType: file.name.split('.').pop().toUpperCase()
        };
      }

      async function parseCommissionPdf(file) {
        if (!window.pdfjsLib) throw new Error('PDF 解析组件未加载，请检查 vendor/pdf.min.js 是否存在。');
        const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const allLines = [];
        const matches = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const textContent = await page.getTextContent();
          const lines = [];
          textContent.items.filter((item) => item.str && item.str.trim()).forEach((item) => {
            const x = item.transform?.[4] ?? 0;
            const y = item.transform?.[5] ?? 0;
            let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
            if (!line) { line = { y, items: [] }; lines.push(line); }
            line.items.push({ x, text: item.str.trim() });
          });
          lines.sort((a, b) => b.y - a.y);
          lines.forEach((line) => {
            const text = line.items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ');
            allLines.push(text);
            const value = findCommissionAmount(text);
            if (value !== null) matches.push({ value, location: `第 ${pageNumber} 页` });
          });
          page.cleanup();
        }
        await pdf.destroy();
        if (!matches.length) {
          if (!allLines.some((line) => line.trim())) throw new Error('PDF 中没有可提取的文字，可能是扫描件；当前版本暂不支持 OCR。');
          throw new Error('PDF 中未找到“Total standard commission fee, (CNY)”对应的数值。');
        }
        const selected = matches[matches.length - 1];
        return {
          id: `${file.name}|${file.size}|${file.lastModified}`,
          fileName: file.name,
          fileSize: file.size,
          importedAt: Date.now(),
          total: selected.value,
          location: selected.location,
          period: normalizeFbsPeriod(logisticsPeriodMeta(allLines.join('\n'), file.name)),
          sourceType: 'PDF'
        };
      }

      async function parseCommissionFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        if (extension === 'pdf') return parseCommissionPdf(file);
        if (['xlsx', 'xls', 'csv'].includes(extension)) return parseCommissionExcel(file);
        throw new Error(`${file.name}：格式不支持，请使用 .pdf、.xlsx、.xls 或 .csv。`);
      }

      function renderMatchDetails(reports) {
        const matches = reports.flatMap((report) => report.matches.map((match) => ({ ...match, fileName: report.fileName })));
        elements.matchTableBody.innerHTML = matches.map((match) => `
          <tr>
            <td title="${escapeHTML(match.fileName)}">${escapeHTML(match.fileName)}</td>
            <td>${escapeHTML(match.sheetName)}</td>
            <td>${escapeHTML(cellAddress(match.rowIndex, match.colIndex))}</td>
            <td class="label-cell">${escapeHTML(match.label)}</td>
            <td>${formatMoney(match.value)} CNY</td>
          </tr>`).join('');
      }

      function periodBuckets(periodType, reports = state.reports) {
        const buckets = new Map();
        reports.forEach((report) => {
          const key = report.period[`${periodType}Key`];
          if (!key) return;
          const bucket = buckets.get(key) || { key, total: 0, count: 0 };
          bucket.total += report.total;
          bucket.count += 1;
          buckets.set(key, bucket);
        });
        return [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key));
      }

      function periodLabel(key, periodType) {
        if (periodType === 'year') return `${key}年`;
        if (periodType === 'quarter') {
          const [year, quarter] = key.split('-');
          return `${year}年${quarter.replace('Q', '第')}季度`;
        }
        const [year, month] = key.split('-');
        return `${year}年${month}月`;
      }

      function expensePeriodKeys(dateText) {
        const [yearText, monthText] = String(dateText || '').split('-');
        const year = Number(yearText);
        const month = Number(monthText);
        if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
        return { year: String(year), quarter: `${year}-Q${Math.floor((month - 1) / 3) + 1}`, month: `${year}-${String(month).padStart(2, '0')}` };
      }

      function expensePeriodBuckets(periodType) {
        const keyName = { year: 'year', quarter: 'quarter', month: 'month' }[periodType];
        const buckets = new Map();
        state.expenseReports.forEach((report) => {
          const keys = expensePeriodKeys(report.date);
          if (!keys) return;
          const key = keys[keyName];
          const bucket = buckets.get(key) || { key, total: 0, count: 0 };
          bucket.total += Number(report.amount) || 0;
          bucket.count += 1;
          buckets.set(key, bucket);
        });
        return [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key));
      }

      function renderExpensePeriodSummary() {
        const summaries = [
          ['year', elements.expenseYearSummaryBody],
          ['quarter', elements.expenseQuarterSummaryBody],
          ['month', elements.expenseMonthSummaryBody]
        ];
        summaries.forEach(([periodType, target]) => {
          const groups = expensePeriodBuckets(periodType);
          if (!groups.length) {
            target.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
            return;
          }
          target.innerHTML = groups.map((group) => `<tr><td>${periodLabel(group.key, periodType)}</td><td>${formatMoney(group.total)}</td><td>${group.count}</td></tr>`).join('');
        });
      }

      function renderExpenseDashboard() {
        const reports = state.expenseReports;
        if (!reports.length) {
          elements.expenseEmptyState.style.display = 'grid';
          elements.expenseResultArea.classList.remove('visible');
          elements.expensePeriodPill.textContent = '等待添加支出';
          return;
        }
        const total = reports.reduce((sum, report) => sum + (Number(report.amount) || 0), 0);
        const sorted = reports.slice().sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || 0) - (a.createdAt || 0));
        const dates = reports.map((report) => report.date).filter(Boolean).sort();
        elements.expenseEmptyState.style.display = 'none';
        elements.expenseResultArea.classList.add('visible');
        elements.expensePeriodPill.textContent = `${reports.length} 条支出 · ${dates[0]} 至 ${dates[dates.length - 1]}`;
        elements.expenseMetricValue.textContent = formatMoney(total);
        elements.expenseMetricFoot.textContent = `共 ${reports.length} 条手动记录`;
        elements.expenseCountValue.textContent = `${reports.length} 条`;
        elements.expenseRangeValue.textContent = `${dates[0]} 至 ${dates[dates.length - 1]}`;
        elements.expenseDetailBody.innerHTML = sorted.map((report) => `
          <tr><td>${escapeHTML(report.date)}</td><td>${escapeHTML(report.title)}</td><td>${escapeHTML(report.note || '—')}</td><td>${formatMoney(Number(report.amount) || 0)}</td><td><button class="expense-copy-button" type="button" data-copy-expense-id="${escapeHTML(report.id)}">复制</button><button class="expense-delete-button" type="button" data-expense-id="${escapeHTML(report.id)}">删除</button></td></tr>`).join('');
        renderExpensePeriodSummary();
      }

      async function handleExpenseSubmit(event) {
        event.preventDefault();
        const date = elements.expenseDateInput.value;
        const title = elements.expenseTitleInput.value.trim();
        const amount = Number(elements.expenseAmountInput.value);
        const note = elements.expenseNoteInput.value.trim();
        if (!date || !title || !Number.isFinite(amount) || amount <= 0) {
          showToast('请填写有效的支出日期、项目和大于零的金额。');
          return;
        }
        const report = { id: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, date, title, amount: Math.round(amount * 100) / 100, note, createdAt: Date.now() };
        const importRevision = state.expenseImportRevision;
        const database = await state.expenseDatabasePromise;
        if (importRevision !== state.expenseImportRevision) return;
        if (database) {
          try {
            await storeReports(database, [report]);
          } catch (error) {
            showToast(`支出保存失败：${error.message}`);
            return;
          }
        }
        if (importRevision !== state.expenseImportRevision) return;
        state.expenseReports.push(report);
        renderExpenseDashboard();
        elements.expenseForm.reset();
        elements.expenseDateInput.value = localDateInputValue();
        showToast(database ? '支出已添加并保存在本地。' : '支出已添加，但本地保存不可用；刷新页面后记录可能丢失。');
      }

      async function deleteExpense(id) {
        const target = state.expenseReports.find((report) => report.id === id);
        if (!target) return;
        const importRevision = state.expenseImportRevision;
        const database = await state.expenseDatabasePromise;
        if (importRevision !== state.expenseImportRevision) return;
        if (database) {
          try {
            await new Promise((resolve, reject) => {
              const transaction = database.transaction(REPORT_STORE, 'readwrite');
              transaction.objectStore(REPORT_STORE).delete(id);
              transaction.oncomplete = resolve;
              transaction.onerror = () => reject(transaction.error || new Error('删除支出失败。'));
              transaction.onabort = () => reject(transaction.error || new Error('删除支出失败。'));
            });
          } catch (error) {
            showToast(`删除支出失败：${error.message}`);
            return;
          }
        }
        if (importRevision !== state.expenseImportRevision) return;
        state.expenseReports = state.expenseReports.filter((report) => report.id !== id);
        renderExpenseDashboard();
        showToast('支出记录已删除。');
      }

      async function copyExpense(id) {
        const source = state.expenseReports.find((report) => report.id === id);
        if (!source) return;
        const copy = {
          ...source,
          id: `expense-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          createdAt: Date.now()
        };
        const importRevision = state.expenseImportRevision;
        const database = await state.expenseDatabasePromise;
        if (importRevision !== state.expenseImportRevision) return;
        if (database) {
          try {
            await storeReports(database, [copy]);
          } catch (error) {
            showToast(`复制支出失败：${error.message}`);
            return;
          }
        }
        if (importRevision !== state.expenseImportRevision) return;
        state.expenseReports.push(copy);
        renderExpenseDashboard();
        showToast(database ? '支出记录已复制并保存。' : '支出记录已复制，但本地保存不可用；刷新页面后副本可能丢失。');
      }

      function resetExpenseView() {
        state.expenseImportRevision += 1;
        const clearRevision = state.expenseImportRevision;
        state.expenseReports = [];
        elements.expenseForm.reset();
        elements.expenseDateInput.value = localDateInputValue();
        renderExpenseDashboard();
        state.expenseDatabasePromise.then(async (database) => {
          if (database) await clearStoredReports(database);
          if (clearRevision !== state.expenseImportRevision) return;
          showToast(database ? '所有支出记录和本地保存数据已清空。' : '支出页面数据已清空；本地保存不可用。');
        }).catch(() => {
          if (clearRevision === state.expenseImportRevision) showToast('支出页面数据已清空，但删除本地记录失败。');
        });
      }

      function renderPeriodSummary() {
        const summaries = [
          ['year', elements.yearSummaryBody],
          ['quarter', elements.quarterSummaryBody],
          ['month', elements.monthSummaryBody]
        ];
        summaries.forEach(([periodType, target]) => {
          const groups = periodBuckets(periodType);
          if (!groups.length) {
            target.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
            return;
          }
          target.innerHTML = groups.map((group) => `
            <tr><td>${periodLabel(group.key, periodType)}</td><td>${formatMoney(group.total)}</td><td>${group.count}</td></tr>`).join('');
        });
      }

      function renderLogisticsPeriodSummary() {
        const summaries = [
          ['year', elements.logisticsYearSummaryBody],
          ['quarter', elements.logisticsQuarterSummaryBody],
          ['month', elements.logisticsMonthSummaryBody]
        ];
        summaries.forEach(([periodType, target]) => {
          const groups = periodBuckets(periodType, state.logisticsReports);
          if (!groups.length) {
            target.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
            return;
          }
          target.innerHTML = groups.map((group) => `
            <tr><td>${periodLabel(group.key, periodType)}</td><td>${formatMoney(group.total)}</td><td>${group.count}</td></tr>`).join('');
        });
      }

      function renderLogisticsDashboard() {
        const reports = state.logisticsReports;
        if (!reports.length) return;
        const total = reports.reduce((sum, report) => sum + report.total, 0);
        const totalBytes = reports.reduce((sum, report) => sum + report.fileSize, 0);
        const allDates = reports.flatMap((report) => report.period.start && report.period.end ? [report.period.start, report.period.end] : []);
        const earliest = [...allDates].sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day)[0];
        const latest = [...allDates].sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day)[0];
        const years = [...new Set(reports.map((report) => report.period.yearKey).filter(Boolean))].sort();
        const quarters = [...new Set(reports.map((report) => report.period.quarterKey).filter(Boolean))].sort();
        const months = [...new Set(reports.map((report) => report.period.monthKey).filter(Boolean))].sort();
        const periodRange = earliest && latest ? `${formatDateToken(earliest)} 至 ${formatDateToken(latest)}` : '日期未完整识别';

        elements.logisticsEmptyState.style.display = 'none';
        elements.logisticsResultArea.classList.add('visible');
        elements.logisticsPeriodPill.textContent = `${reports.length} 份账单 · ${periodRange}`;
        elements.logisticsMetricValue.textContent = formatMoney(total);
        elements.logisticsMetricFoot.textContent = `${reports.length} 份账单 Total 数值合计`;
        elements.logisticsFileCount.textContent = `${reports.length} 份账单`;
        elements.logisticsFileMeta.textContent = `${formatBytes(totalBytes)} · PDF、Excel、CSV 文件`;
        elements.logisticsMatchSummary.textContent = `${reports.length} 份已识别`;
        elements.logisticsMatchSub.textContent = '每份账单读取最后一个 Total 数值';
        elements.logisticsYearValue.textContent = years.length ? years.map((year) => `${year}年`).join('、') : '—';
        elements.logisticsYearSub.textContent = `${periodBuckets('year', reports).length} 个年度可汇总`;
        elements.logisticsQuarterValue.textContent = quarters.length ? quarters.map((key) => periodLabel(key, 'quarter')).join('、') : '—';
        elements.logisticsQuarterSub.textContent = `${periodBuckets('quarter', reports).length} 个季度可汇总`;
        elements.logisticsMonthValue.textContent = months.length ? months.map((key) => periodLabel(key, 'month')).join('、') : '—';
        elements.logisticsMonthSub.textContent = `${periodBuckets('month', reports).length} 个月份可汇总`;
        elements.logisticsDetailBody.innerHTML = reports.slice().sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0)).map((report) => `
          <tr><td title="${escapeHTML(report.fileName)}">${escapeHTML(report.fileName)}</td><td>${escapeHTML(report.period.rangeLabel)}</td><td>${escapeHTML(report.location)}</td><td>${formatMoney(report.total)}</td></tr>`).join('');
        renderLogisticsPeriodSummary();
      }

      function renderFbsPeriodSummary() {
        const summaries = [
          ['year', elements.fbsYearSummaryBody],
          ['quarter', elements.fbsQuarterSummaryBody],
          ['month', elements.fbsMonthSummaryBody]
        ];
        summaries.forEach(([periodType, target]) => {
          const groups = periodBuckets(periodType, state.fbsReports);
          if (!groups.length) {
            target.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
            return;
          }
          target.innerHTML = groups.map((group) => `<tr><td>${periodLabel(group.key, periodType)}</td><td>${formatMoney(group.total)}</td><td>${group.count}</td></tr>`).join('');
        });
      }

      function renderFbsDashboard() {
        const reports = state.fbsReports;
        if (!reports.length) return;
        const total = reports.reduce((sum, report) => sum + report.total, 0);
        const totalBytes = reports.reduce((sum, report) => sum + report.fileSize, 0);
        const allDates = reports.flatMap((report) => report.period.start && report.period.end ? [report.period.start, report.period.end] : []);
        const earliest = [...allDates].sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day)[0];
        const latest = [...allDates].sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day)[0];
        const years = [...new Set(reports.map((report) => report.period.yearKey).filter(Boolean))].sort();
        const quarters = [...new Set(reports.map((report) => report.period.quarterKey).filter(Boolean))].sort();
        const months = [...new Set(reports.map((report) => report.period.monthKey).filter(Boolean))].sort();
        const periodRange = earliest && latest ? `${formatDateToken(earliest)} 至 ${formatDateToken(latest)}` : '日期未完整识别';

        elements.fbsEmptyState.style.display = 'none';
        elements.fbsResultArea.classList.add('visible');
        elements.fbsPeriodPill.textContent = `${reports.length} 份账单 · ${periodRange}`;
        elements.fbsMetricValue.textContent = formatMoney(total);
        elements.fbsMetricFoot.textContent = `${reports.length} 份账单 In total for payment 数值合计`;
        elements.fbsFileCount.textContent = `${reports.length} 份账单`;
        elements.fbsFileMeta.textContent = `${formatBytes(totalBytes)} · PDF、Excel、CSV 文件`;
        elements.fbsMatchSummary.textContent = `${reports.length} 份已识别`;
        elements.fbsMatchSub.textContent = '每份账单读取最后一个 In total for payment 数值';
        elements.fbsYearValue.textContent = years.length ? years.map((year) => `${year}年`).join('、') : '—';
        elements.fbsYearSub.textContent = `${periodBuckets('year', reports).length} 个年度可汇总`;
        elements.fbsQuarterValue.textContent = quarters.length ? quarters.map((key) => periodLabel(key, 'quarter')).join('、') : '—';
        elements.fbsQuarterSub.textContent = `${periodBuckets('quarter', reports).length} 个季度可汇总`;
        elements.fbsMonthValue.textContent = months.length ? months.map((key) => periodLabel(key, 'month')).join('、') : '—';
        elements.fbsMonthSub.textContent = `${periodBuckets('month', reports).length} 个月份可汇总`;
        elements.fbsDetailBody.innerHTML = reports.slice().sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0)).map((report) =>
          `<tr><td title="${escapeHTML(report.fileName)}">${escapeHTML(report.fileName)}</td><td>${escapeHTML(report.period.rangeLabel)}</td><td>${escapeHTML(report.location)}</td><td>${formatMoney(report.total)}</td></tr>`).join('');
        renderFbsPeriodSummary();
      }

      function renderCommissionPeriodSummary() {
        const summaries = [
          ['year', elements.commissionYearSummaryBody],
          ['quarter', elements.commissionQuarterSummaryBody],
          ['month', elements.commissionMonthSummaryBody]
        ];
        summaries.forEach(([periodType, target]) => {
          const groups = periodBuckets(periodType, state.commissionReports);
          if (!groups.length) {
            target.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
            return;
          }
          target.innerHTML = groups.map((group) => `<tr><td>${periodLabel(group.key, periodType)}</td><td>${formatMoney(group.total)}</td><td>${group.count}</td></tr>`).join('');
        });
      }

      function renderCommissionDashboard() {
        const reports = state.commissionReports;
        if (!reports.length) return;
        const total = reports.reduce((sum, report) => sum + report.total, 0);
        const totalBytes = reports.reduce((sum, report) => sum + report.fileSize, 0);
        const allDates = reports.flatMap((report) => report.period.start && report.period.end ? [report.period.start, report.period.end] : []);
        const earliest = [...allDates].sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day)[0];
        const latest = [...allDates].sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day)[0];
        const years = [...new Set(reports.map((report) => report.period.yearKey).filter(Boolean))].sort();
        const quarters = [...new Set(reports.map((report) => report.period.quarterKey).filter(Boolean))].sort();
        const months = [...new Set(reports.map((report) => report.period.monthKey).filter(Boolean))].sort();
        const periodRange = earliest && latest ? `${formatDateToken(earliest)} 至 ${formatDateToken(latest)}` : '日期未完整识别';

        elements.commissionEmptyState.style.display = 'none';
        elements.commissionResultArea.classList.add('visible');
        elements.commissionPeriodPill.textContent = `${reports.length} 份账单 · ${periodRange}`;
        elements.commissionMetricValue.textContent = formatMoney(total);
        elements.commissionMetricFoot.textContent = `${reports.length} 份账单标准佣金合计`;
        elements.commissionFileCount.textContent = `${reports.length} 份账单`;
        elements.commissionFileMeta.textContent = `${formatBytes(totalBytes)} · PDF、Excel、CSV 文件`;
        elements.commissionMatchSummary.textContent = `${reports.length} 份已识别`;
        elements.commissionMatchSub.textContent = '每份账单读取最后一个匹配的标准佣金总数';
        elements.commissionYearValue.textContent = years.length ? years.map((year) => `${year}年`).join('、') : '—';
        elements.commissionYearSub.textContent = `${periodBuckets('year', reports).length} 个年度可汇总`;
        elements.commissionQuarterValue.textContent = quarters.length ? quarters.map((key) => periodLabel(key, 'quarter')).join('、') : '—';
        elements.commissionQuarterSub.textContent = `${periodBuckets('quarter', reports).length} 个季度可汇总`;
        elements.commissionMonthValue.textContent = months.length ? months.map((key) => periodLabel(key, 'month')).join('、') : '—';
        elements.commissionMonthSub.textContent = `${periodBuckets('month', reports).length} 个月份可汇总`;
        elements.commissionDetailBody.innerHTML = reports.slice().sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0)).map((report) =>
          `<tr><td title="${escapeHTML(report.fileName)}">${escapeHTML(report.fileName)}</td><td>${escapeHTML(report.period.rangeLabel)}</td><td>${escapeHTML(report.location)}</td><td>${formatMoney(report.total)}</td></tr>`).join('');
        renderCommissionPeriodSummary();
      }

      function renderDashboard() {
        const reports = state.reports;
        if (!reports.length) return;
        const total = reports.reduce((sum, report) => sum + report.total, 0);
        const allMatches = reports.flatMap((report) => report.matches);
        const rowCount = reports.reduce((sum, report) => sum + report.rowCount, 0);
        const allDates = reports.flatMap((report) => report.period.start && report.period.end ? [report.period.start, report.period.end] : []);
        const earliest = [...allDates].sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day)[0];
        const latest = [...allDates].sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day)[0];
        const years = [...new Set(reports.map((report) => report.period.yearKey).filter(Boolean))].sort();
        const quarters = [...new Set(reports.map((report) => report.period.quarterKey).filter(Boolean))].sort();
        const months = [...new Set(reports.map((report) => report.period.monthKey).filter(Boolean))].sort();
        const totalBytes = reports.reduce((sum, report) => sum + report.fileSize, 0);
        const periodRange = earliest && latest ? `${formatDateToken(earliest)} 至 ${formatDateToken(latest)}` : '日期未完整识别';

        elements.emptyState.style.display = 'none';
        elements.resultArea.classList.add('visible');
        elements.periodPill.textContent = `${reports.length} 份报告 · ${periodRange}`;
        elements.yearValue.textContent = years.length ? years.map((year) => `${year}年`).join('、') : '—';
        elements.yearSub.textContent = `${periodBuckets('year').length} 个年度可汇总`;
        elements.quarterValue.textContent = quarters.length ? quarters.map((key) => periodLabel(key, 'quarter')).join('、') : '—';
        elements.quarterSub.textContent = `${periodBuckets('quarter').length} 个季度可汇总`;
        elements.monthValue.textContent = months.length ? months.map((key) => periodLabel(key, 'month')).join('、') : '—';
        elements.monthSub.textContent = `${periodBuckets('month').length} 个月份可汇总`;
        elements.metricValue.innerHTML = `${formatMoney(total)} <span class="currency">CNY</span>`;
        elements.metricFoot.textContent = `${reports.length} 份已导入报告金额合计`;
        elements.fileName.textContent = reports.length === 1 ? reports[0].fileName : `${reports.length} 份销售报告`;
        elements.fileName.title = reports.map((report) => report.fileName).join('\n');
        elements.fileMeta.textContent = `${formatBytes(totalBytes)} · ${reports.reduce((sum, report) => sum + report.sheetData.length, 0)} 个工作表 · ${rowCount} 行数据`;
        elements.matchSummary.textContent = `${allMatches.length} 个匹配项`;
        elements.matchSub.textContent = reports.length > 1 ? `来自 ${reports.length} 份文件` : allMatches.length === 1 ? '已读取同一行右侧数值' : '已按匹配数值合计';
        elements.sourceNote.textContent = `数据仅在本地浏览器解析，不会上传原始文件。已导入 ${reports.length} 份报告；周期汇总只累计期间明确的文件，不对跨周期金额进行估算分摊。`;
        renderMatchDetails(reports);
        renderPeriodSummary();
      }

      function resetView() {
        state.importRevision += 1;
        const clearRevision = state.importRevision;
        state.reports = [];
        elements.fileInput.value = '';
        elements.yearValue.textContent = '—';
        elements.yearSub.textContent = '等待日期识别';
        elements.quarterValue.textContent = '—';
        elements.quarterSub.textContent = '等待日期识别';
        elements.monthValue.textContent = '—';
        elements.monthSub.textContent = '等待日期识别';
        elements.metricValue.innerHTML = '— <span class="currency">CNY</span>';
        elements.metricFoot.textContent = '来源：等待读取';
        elements.fileName.textContent = '—';
        elements.fileName.title = '';
        elements.fileMeta.textContent = '—';
        elements.matchSummary.textContent = '—';
        elements.matchSub.textContent = '—';
        elements.matchTableBody.innerHTML = '';
        elements.yearSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.quarterSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.monthSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.sourceNote.textContent = '数据在本地浏览器中解析，不会上传原始文件。';
        elements.resultArea.classList.remove('visible');
        elements.emptyState.style.display = 'grid';
        elements.periodPill.textContent = '等待导入报告';
        state.databasePromise.then(async (database) => {
          if (database) await clearStoredReports(database);
          if (clearRevision !== state.importRevision) return;
          showToast(database
            ? '已清空所有已导入数据及本地保存记录，可以重新导入。'
            : '当前页面数据已清空；本地保存不可用，刷新后数据无法保留。');
        }).catch(() => {
          if (clearRevision === state.importRevision) showToast('页面数据已清空，但删除本地保存记录失败；刷新后数据可能恢复。');
        });
      }

      function resetLogisticsView() {
        state.logisticsImportRevision += 1;
        const clearRevision = state.logisticsImportRevision;
        state.logisticsReports = [];
        elements.logisticsFileInput.value = '';
        elements.logisticsMetricValue.textContent = '—';
        elements.logisticsMetricFoot.textContent = '来源：等待读取';
        elements.logisticsFileCount.textContent = '—';
        elements.logisticsFileMeta.textContent = '—';
        elements.logisticsMatchSummary.textContent = '—';
        elements.logisticsMatchSub.textContent = '—';
        elements.logisticsYearValue.textContent = '—';
        elements.logisticsYearSub.textContent = '等待日期识别';
        elements.logisticsQuarterValue.textContent = '—';
        elements.logisticsQuarterSub.textContent = '等待日期识别';
        elements.logisticsMonthValue.textContent = '—';
        elements.logisticsMonthSub.textContent = '等待日期识别';
        elements.logisticsYearSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.logisticsQuarterSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.logisticsMonthSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.logisticsDetailBody.innerHTML = '';
        elements.logisticsResultArea.classList.remove('visible');
        elements.logisticsEmptyState.style.display = 'grid';
        elements.logisticsPeriodPill.textContent = '等待导入账单';
        state.logisticsDatabasePromise.then(async (database) => {
          if (database) await clearStoredReports(database);
          if (clearRevision !== state.logisticsImportRevision) return;
          showToast(database
            ? '已清空所有物流账单及本地保存记录，可以重新导入。'
            : '物流费页面数据已清空；刷新后数据无法保留。');
        }).catch(() => {
          if (clearRevision === state.logisticsImportRevision) showToast('物流费页面数据已清空，但删除本地保存记录失败；刷新后数据可能恢复。');
        });
      }

      function resetFbsView() {
        state.fbsImportRevision += 1;
        const clearRevision = state.fbsImportRevision;
        state.fbsReports = [];
        elements.fbsFileInput.value = '';
        elements.fbsMetricValue.textContent = '—';
        elements.fbsMetricFoot.textContent = '来源：等待读取';
        elements.fbsFileCount.textContent = '—';
        elements.fbsFileMeta.textContent = '—';
        elements.fbsMatchSummary.textContent = '—';
        elements.fbsMatchSub.textContent = '—';
        elements.fbsYearValue.textContent = '—';
        elements.fbsYearSub.textContent = '等待日期识别';
        elements.fbsQuarterValue.textContent = '—';
        elements.fbsQuarterSub.textContent = '等待日期识别';
        elements.fbsMonthValue.textContent = '—';
        elements.fbsMonthSub.textContent = '等待日期识别';
        elements.fbsYearSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.fbsQuarterSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.fbsMonthSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.fbsDetailBody.innerHTML = '';
        elements.fbsResultArea.classList.remove('visible');
        elements.fbsEmptyState.style.display = 'grid';
        elements.fbsPeriodPill.textContent = '等待导入账单';
        state.fbsDatabasePromise.then(async (database) => {
          if (database) await clearStoredReports(database);
          if (clearRevision !== state.fbsImportRevision) return;
          showToast(database
            ? '已清空所有 FBS 运费账单及本地保存记录，可以重新导入。'
            : 'FBS运费页面数据已清空；刷新后数据无法保留。');
        }).catch(() => {
          if (clearRevision === state.fbsImportRevision) showToast('FBS运费页面数据已清空，但删除本地保存记录失败；刷新后数据可能恢复。');
        });
      }

      function resetCommissionView() {
        state.commissionImportRevision += 1;
        const clearRevision = state.commissionImportRevision;
        state.commissionReports = [];
        elements.commissionFileInput.value = '';
        elements.commissionMetricValue.textContent = '—';
        elements.commissionMetricFoot.textContent = '来源：等待读取';
        elements.commissionFileCount.textContent = '—';
        elements.commissionFileMeta.textContent = '—';
        elements.commissionMatchSummary.textContent = '—';
        elements.commissionMatchSub.textContent = '—';
        elements.commissionYearValue.textContent = '—';
        elements.commissionYearSub.textContent = '等待日期识别';
        elements.commissionQuarterValue.textContent = '—';
        elements.commissionQuarterSub.textContent = '等待日期识别';
        elements.commissionMonthValue.textContent = '—';
        elements.commissionMonthSub.textContent = '等待日期识别';
        elements.commissionYearSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.commissionQuarterSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.commissionMonthSummaryBody.innerHTML = '<tr><td class="summary-empty" colspan="3">暂无可汇总数据</td></tr>';
        elements.commissionDetailBody.innerHTML = '';
        elements.commissionResultArea.classList.remove('visible');
        elements.commissionEmptyState.style.display = 'grid';
        elements.commissionPeriodPill.textContent = '等待导入账单';
        state.commissionDatabasePromise.then(async (database) => {
          if (database) await clearStoredReports(database);
          if (clearRevision !== state.commissionImportRevision) return;
          showToast(database
            ? '已清空所有佣金账单及本地保存记录，可以重新导入。'
            : '佣金页面数据已清空；刷新后数据无法保留。');
        }).catch(() => {
          if (clearRevision === state.commissionImportRevision) showToast('佣金页面数据已清空，但删除本地保存记录失败；刷新后数据可能恢复。');
        });
      }

      async function handleLogisticsFiles(fileList) {
        const files = [...(fileList || [])];
        if (!files.length) return;
        const importRevision = state.logisticsImportRevision;
        const results = await Promise.allSettled(files.map(parseLogisticsFile));
        if (importRevision !== state.logisticsImportRevision) return;
        const database = await state.logisticsDatabasePromise;
        if (importRevision !== state.logisticsImportRevision) return;
        const existing = new Set(state.logisticsReports.map((report) => report.id));
        const batchIds = new Set();
        const added = results.filter((result) => {
          if (result.status !== 'fulfilled' || existing.has(result.value.id) || batchIds.has(result.value.id)) return false;
          batchIds.add(result.value.id);
          return true;
        }).map((result) => result.value);
        let persistenceWarning = '';
        if (added.length && database) {
          try {
            await storeReports(database, added);
          } catch {
            persistenceWarning = '导入成功，但本地保存失败，刷新页面后这些账单可能丢失。';
          }
        } else if (added.length) {
          persistenceWarning = '本地保存不可用，刷新页面后这些账单可能丢失。';
        }
        if (importRevision !== state.logisticsImportRevision) return;
        state.logisticsReports.push(...added);
        const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason.message);
        const duplicates = results.filter((result) => result.status === 'fulfilled' && existing.has(result.value.id)).length;
        elements.logisticsFileInput.value = '';
        if (state.logisticsReports.length) renderLogisticsDashboard();
        if (failures.length || duplicates || persistenceWarning) {
          showToast([...failures, ...(duplicates ? [`${duplicates} 份重复账单已跳过。`] : []), persistenceWarning].filter(Boolean).join(' '));
        } else if (added.length) {
          showToast(`已导入并保存在本地的 ${added.length} 份物流账单；刷新页面后仍会保留。`);
        }
      }

      async function handleFbsFiles(fileList) {
        const files = [...(fileList || [])];
        if (!files.length) return;
        const importRevision = state.fbsImportRevision;
        const results = await Promise.allSettled(files.map(parseFbsFile));
        if (importRevision !== state.fbsImportRevision) return;
        const database = await state.fbsDatabasePromise;
        if (importRevision !== state.fbsImportRevision) return;
        const existing = new Set(state.fbsReports.map((report) => report.id));
        const batchIds = new Set();
        const added = results.filter((result) => {
          if (result.status !== 'fulfilled' || existing.has(result.value.id) || batchIds.has(result.value.id)) return false;
          batchIds.add(result.value.id);
          return true;
        }).map((result) => result.value);
        let persistenceWarning = '';
        if (added.length && database) {
          try {
            await storeReports(database, added);
          } catch {
            persistenceWarning = '导入成功，但本地保存失败，刷新页面后这些 FBS 运费账单可能丢失。';
          }
        } else if (added.length) {
          persistenceWarning = '本地保存不可用，刷新页面后这些 FBS 运费账单可能丢失。';
        }
        if (importRevision !== state.fbsImportRevision) return;
        state.fbsReports.push(...added.map(normalizeFbsReport));
        const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason.message);
        const duplicates = results.filter((result) => result.status === 'fulfilled' && existing.has(result.value.id)).length;
        elements.fbsFileInput.value = '';
        if (state.fbsReports.length) renderFbsDashboard();
        if (failures.length || duplicates || persistenceWarning) {
          showToast([...failures, ...(duplicates ? [`${duplicates} 份重复账单已跳过。`] : []), persistenceWarning].filter(Boolean).join(' '));
        } else if (added.length) {
          showToast(`已导入并保存在本地的 ${added.length} 份 FBS 运费账单；刷新页面后仍会保留。`);
        }
      }

      async function handleCommissionFiles(fileList) {
        const files = [...(fileList || [])];
        if (!files.length) return;
        const importRevision = state.commissionImportRevision;
        const results = await Promise.allSettled(files.map(parseCommissionFile));
        if (importRevision !== state.commissionImportRevision) return;
        const database = await state.commissionDatabasePromise;
        if (importRevision !== state.commissionImportRevision) return;
        const existing = new Set(state.commissionReports.map((report) => report.id));
        const batchIds = new Set();
        const added = results.filter((result) => {
          if (result.status !== 'fulfilled' || existing.has(result.value.id) || batchIds.has(result.value.id)) return false;
          batchIds.add(result.value.id);
          return true;
        }).map((result) => result.value);
        let persistenceWarning = '';
        if (added.length && database) {
          try {
            await storeReports(database, added);
          } catch {
            persistenceWarning = '导入成功，但本地保存失败，刷新页面后这些佣金账单可能丢失。';
          }
        } else if (added.length) {
          persistenceWarning = '本地保存不可用，刷新页面后这些佣金账单可能丢失。';
        }
        if (importRevision !== state.commissionImportRevision) return;
        state.commissionReports.push(...added);
        const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason.message);
        const duplicates = results.filter((result) => result.status === 'fulfilled' && existing.has(result.value.id)).length;
        elements.commissionFileInput.value = '';
        if (state.commissionReports.length) renderCommissionDashboard();
        if (failures.length || duplicates || persistenceWarning) {
          showToast([...failures, ...(duplicates ? [`${duplicates} 份重复账单已跳过。`] : []), persistenceWarning].filter(Boolean).join(' '));
        } else if (added.length) {
          showToast(`已导入并保存在本地的 ${added.length} 份佣金账单；刷新页面后仍会保留。`);
        }
      }

      // 利润核算（第六模块）独立使用 profit 前缀，避免影响前五个报告模块。
      const PROFIT_ROUTES = {
        extraSmall: { label: 'Economy Extra Small', rate: 28.1, fixed: 3.37, minWeight: 0.001, maxWeight: 0.5, minValue: 1, maxValue: 1500, maxSum: 90, maxSide: [60, 60, 60], rule: '按实际重量' },
        budget: { label: 'Economy Budget', rate: 19.1, fixed: 25.83, minWeight: 0.5, maxWeight: 30, minValue: 0, maxValue: 1500, maxSum: 150, maxSide: [60, 60, 60], rule: '按实际重量' },
        small: { label: 'Economy Small', rate: 28.1, fixed: 17.97, minWeight: 0.001, maxWeight: 2, minValue: 1501, maxValue: 7000, maxSum: 150, maxSide: [60, 60, 60], rule: '按实际重量' },
        big: { label: 'Economy Big', rate: 19.1, fixed: 40.44, minWeight: 2, maxWeight: 30, minValue: 1501, maxValue: 7000, maxSum: 310, maxSide: [150, 80, 80], rule: '符合条件时按体积重与实际重量取高' },
        premiumSmall: { label: 'Economy Premium Small', rate: 28.1, fixed: 24.71, minWeight: 0.001, maxWeight: 5, minValue: 7001, maxValue: 250000, maxSum: 250, maxSide: [150, 80, 80], rule: '按实际重量' },
        premiumBig: { label: 'Economy Premium Big', rate: 25.8, fixed: 69.64, minWeight: 5, maxWeight: 30, minValue: 7001, maxValue: 250000, maxSum: 310, maxSide: [150, 80, 80], rule: '符合条件时按体积重与实际重量取高' }
      };
      const PROFIT_DEFAULTS = { productName: '大件商品示例', sellingPriceRmb: 7000 / 11.5, length: 48, width: 52, height: 50, actualWeight: 7.9, productCost: 175, commissionRate: 10, adCost: 0, otherCost: 0, exchangeRate: 11.5, routeMode: 'auto', targetProfit: 250 };
      const PROFIT_RATE_API_URL = 'https://open.er-api.com/v6/latest/CNY';
      const PROFIT_RATE_CACHE_KEY = `realFbsCnyRubRateV1-${ACCOUNT_SCOPE}`;
      const PROFIT_FALLBACK_RATE = 11.5;
      const PROFIT_DEFAULT_RUB_PRICE = 7000;
      const PROFIT_ACQUIRING_FEE_RATE = 0.02;
      const OGL_LOGISTICS_PLATFORM_FEE_RATE = 0.02;
      const OGL_TRANSPORT_CONTRACT_FEE_RATE = 0.0035;
      const OGL_STAR_ADS_FEE_RATE = 0.015;
      const OGL_VARIABLE_FEE_RATE = PROFIT_ACQUIRING_FEE_RATE + OGL_LOGISTICS_PLATFORM_FEE_RATE + OGL_TRANSPORT_CONTRACT_FEE_RATE + OGL_STAR_ADS_FEE_RATE;

      function profitSetValues(values) {
        Object.keys(PROFIT_DEFAULTS).forEach((key) => { if (elements[`profit${key.charAt(0).toUpperCase()}${key.slice(1)}`]) elements[`profit${key.charAt(0).toUpperCase()}${key.slice(1)}`].value = values[key]; });
      }
      function profitReadNumber(element) { const value = Number(element?.value); return Number.isFinite(value) ? value : 0; }
      function profitReadInputs() {
        const sellingPriceRmb = profitReadNumber(elements.profitSellingPriceRmb);
        const exchangeRate = profitReadNumber(elements.profitExchangeRate);
        return { productName: elements.profitProductName.value.trim(), sellingPriceRmb, sellingPrice: sellingPriceRmb * exchangeRate, length: profitReadNumber(elements.profitLength), width: profitReadNumber(elements.profitWidth), height: profitReadNumber(elements.profitHeight), actualWeight: profitReadNumber(elements.profitActualWeight), productCost: profitReadNumber(elements.profitProductCost), commissionRate: profitReadNumber(elements.profitCommissionRate), adCost: profitReadNumber(elements.profitAdCost), otherCost: profitReadNumber(elements.profitOtherCost), exchangeRate, routeMode: elements.profitRouteMode.value, targetProfit: profitReadNumber(elements.profitTargetProfit) };
      }
      function profitFormatRmb(value) { return Number.isFinite(value) ? `¥${value.toFixed(2)}` : '—'; }
      function profitFormatPricePair(rmb, rub) { return Number.isFinite(rmb) && Number.isFinite(rub) ? `¥${rmb.toFixed(2)} / ${Math.ceil(rub).toLocaleString('zh-CN')} ₽` : '—'; }
      function profitFormatKg(value) { return `${Number.isFinite(value) ? value.toFixed(3) : '0.000'} kg`; }
      function profitTodayKey() { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
      function profitReadRateCache() { try { const cached = JSON.parse(localStorage.getItem(PROFIT_RATE_CACHE_KEY) || 'null'); return cached && Number.isFinite(Number(cached.rate)) ? { ...cached, rate: Number(cached.rate) } : null; } catch { return null; } }
      function profitWriteRateCache(rate, source, fetchedAt = Date.now()) { const cached = { rate, source, fetchedAt, date: profitTodayKey() }; try { localStorage.setItem(PROFIT_RATE_CACHE_KEY, JSON.stringify(cached)); } catch {} return cached; }
      function profitFormatUpdatedAt(timestamp) { return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '尚未更新'; }
      function profitUpdateRateStatus(message = '') { if (!elements.profitRateStatus) return; elements.profitRateStatus.textContent = state.profitRateState.loading ? '正在更新今日汇率…' : (message || `${state.profitRateState.source} · 更新时间 ${state.profitRateState.updatedAt}`); }
      function profitUpdateSellingPriceHint() { const price = profitReadNumber(elements.profitSellingPriceRmb); const rate = profitReadNumber(elements.profitExchangeRate); elements.profitSellingPriceRubHint.textContent = rate > 0 ? `折合约 ${Math.ceil(price * rate).toLocaleString('zh-CN')} ₽` : '等待汇率'; }
      function profitApplyRate(rate, source, updatedAt) { if (!Number.isFinite(rate) || rate <= 0) return; if (!state.profitHasUserEditedPrice && Math.abs(profitReadNumber(elements.profitSellingPriceRmb) - PROFIT_DEFAULTS.sellingPriceRmb) < 0.01) elements.profitSellingPriceRmb.value = (PROFIT_DEFAULT_RUB_PRICE / rate).toFixed(2); if (!state.oglHasUserEditedPrice) elements.oglSellingPriceRmb.value = (PROFIT_DEFAULT_RUB_PRICE / rate).toFixed(2); elements.profitExchangeRate.value = rate.toFixed(4); state.profitRateState = { source, updatedAt: updatedAt || '尚未更新', loading: false }; profitUpdateRateStatus(); profitUpdateSellingPriceHint(); profitCalculate(); oglRender(); }
      async function profitUpdateExchangeRate(force = false) {
        const cached = profitReadRateCache();
        if (!force && cached && cached.date === profitTodayKey()) { profitApplyRate(cached.rate, `${cached.source || '自动汇率'}（今日缓存）`, profitFormatUpdatedAt(cached.fetchedAt)); return; }
        state.profitRateState.loading = true; profitUpdateRateStatus(); const controller = new AbortController(); const timeoutId = setTimeout(() => controller.abort(), 8000);
        try { const response = await fetch(PROFIT_RATE_API_URL, { signal: controller.signal, cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const payload = await response.json(); const rate = Number(payload?.rates?.RUB); if (!Number.isFinite(rate) || rate <= 0) throw new Error('RUB rate unavailable'); const saved = profitWriteRateCache(rate, 'open.er-api.com', Date.now()); profitApplyRate(saved.rate, saved.source, profitFormatUpdatedAt(saved.fetchedAt)); }
        catch { if (cached?.rate > 0) profitApplyRate(cached.rate, `${cached.source || '缓存汇率'}（网络更新失败）`, profitFormatUpdatedAt(cached.fetchedAt)); else profitApplyRate(PROFIT_FALLBACK_RATE, '内置备用汇率（网络更新失败）', '默认 11.5000'); }
        finally { clearTimeout(timeoutId); state.profitRateState.loading = false; profitUpdateRateStatus(); }
      }
      function profitScheduleDailyRateRefresh() { const now = new Date(); const next = new Date(now); next.setHours(24, 0, 5, 0); setTimeout(async () => { await profitUpdateExchangeRate(true); profitScheduleDailyRateRefresh(); }, Math.max(next.getTime() - now.getTime(), 1000)); }
      function profitDimensionsValid(route, data) { const sides = [data.length, data.width, data.height]; return sides.every((side, index) => side >= 0 && side <= route.maxSide[index]) && sides.reduce((sum, side) => sum + side, 0) <= route.maxSum; }
      function profitWeightValid(route, data) { return data.actualWeight >= route.minWeight && data.actualWeight <= route.maxWeight; }
      function profitValueValid(route, data) { return data.sellingPrice >= route.minValue && data.sellingPrice <= route.maxValue; }
      function profitIsEligible(key, data) { const route = PROFIT_ROUTES[key]; return profitValueValid(route, data) && profitWeightValid(route, data) && profitDimensionsValid(route, data); }
      function profitChargeableWeight(key, data) { const volumeWeight = data.length * data.width * data.height / 12000; const strictBigBand = key === 'big' && data.actualWeight >= 2.001 && data.sellingPrice > 1501 && data.sellingPrice < 7000; const strictPremiumBigBand = key === 'premiumBig' && data.actualWeight >= 5.001 && data.sellingPrice > 7001 && data.sellingPrice < 250000; const usesVolumeWeight = strictBigBand || strictPremiumBigBand; return { volumeWeight, value: usesVolumeWeight ? Math.max(volumeWeight, data.actualWeight) : data.actualWeight, usesVolumeWeight }; }
      function profitRouteFee(key, data) { const route = PROFIT_ROUTES[key]; const weight = profitChargeableWeight(key, data); return { ...weight, shipping: weight.value * route.rate + route.fixed }; }
      function profitEligibleRoutes(data) { return Object.keys(PROFIT_ROUTES).filter((key) => profitIsEligible(key, data)); }
      function profitSelectRoute(data) { const eligible = profitEligibleRoutes(data); if (data.routeMode !== 'auto') return { key: data.routeMode, route: PROFIT_ROUTES[data.routeMode], eligible: profitIsEligible(data.routeMode, data), eligibleRoutes: eligible, fee: profitIsEligible(data.routeMode, data) ? profitRouteFee(data.routeMode, data) : null }; if (!eligible.length) return { key: null, route: null, eligible: false, eligibleRoutes: [], fee: null }; const key = eligible.reduce((best, candidate) => !best || profitRouteFee(candidate, data).shipping < profitRouteFee(best, data).shipping ? candidate : best, null); return { key, route: PROFIT_ROUTES[key], eligible: true, eligibleRoutes: eligible, fee: profitRouteFee(key, data) }; }
      function profitBaseValidation(data) { const missing = []; ['length', 'width', 'height', 'actualWeight', 'productCost', 'exchangeRate'].forEach((key) => { if (data[key] <= 0) missing.push(key); }); if (data.sellingPriceRmb <= 0) missing.push('sellingPriceRmb'); if (data.commissionRate < 0 || data.commissionRate + PROFIT_ACQUIRING_FEE_RATE * 100 >= 100) missing.push('commissionRate'); return missing; }
      function profitCalculateAtPrice(price, baseData) { const data = { ...baseData, sellingPrice: price }; const selection = profitSelectRoute(data); if (!selection.eligible || !selection.fee) return { ...data, selection, valid: false }; const revenue = price / data.exchangeRate; const commission = revenue * data.commissionRate / 100; const acquiringFee = revenue * PROFIT_ACQUIRING_FEE_RATE; const expenses = data.productCost + selection.fee.shipping + commission + acquiringFee + data.adCost + data.otherCost; return { ...data, selection, valid: true, revenue, commission, acquiringFee, expenses, profit: revenue - expenses, margin: revenue ? (revenue - expenses) / revenue : 0 }; }
      function profitFindRecommendedPrice(data) { const target = Math.max(0, data.targetProfit); const candidates = []; const variableFeeRate = data.commissionRate / 100 + PROFIT_ACQUIRING_FEE_RATE; const routeEntries = data.routeMode === 'auto' ? Object.entries(PROFIT_ROUTES) : [[data.routeMode, PROFIT_ROUTES[data.routeMode]]]; for (const [key, route] of routeEntries) { if (!profitIsEligible(key, { ...data, sellingPrice: route.minValue })) continue; let candidatePrice = Math.max(route.minValue, 1); for (let attempt = 0; attempt < 8; attempt += 1) { const shipping = profitRouteFee(key, { ...data, routeMode: key, sellingPrice: candidatePrice }).shipping; const required = (data.productCost + shipping + data.adCost + data.otherCost + target) * data.exchangeRate / (1 - variableFeeRate); const nextPrice = Math.max(route.minValue, Math.ceil(required)); if (nextPrice === candidatePrice) break; candidatePrice = nextPrice; } const candidateData = { ...data, routeMode: key, sellingPrice: candidatePrice }; if (candidatePrice <= route.maxValue && profitIsEligible(key, candidateData)) { const result = profitCalculateAtPrice(candidatePrice, candidateData); if (result.valid && result.profit >= target - 0.01) candidates.push(result); } } candidates.sort((a, b) => a.sellingPrice - b.sellingPrice); return candidates[0] || null; }
      function profitSetStatus(text, kind = '') { elements.profitStatusBadge.textContent = text; elements.profitStatusBadge.className = `profit-status${kind ? ` ${kind}` : ''}`; }
      function profitUpdateNumbers(values) { elements.profitValue.textContent = profitFormatRmb(values.profit); elements.profitMarginValue.textContent = `利润率 ${(values.margin * 100).toFixed(1)}%`; elements.profitRevenueValue.textContent = profitFormatRmb(values.revenue); elements.profitCommissionValue.textContent = profitFormatRmb(values.commission); elements.profitShippingValue.textContent = profitFormatRmb(values.shipping); elements.profitTotalCostValue.textContent = profitFormatRmb(values.expenses); elements.profitProductCostValue.textContent = profitFormatRmb(values.productCost); elements.profitAdCostValue.textContent = profitFormatRmb(values.adCost); elements.profitOtherCostValue.textContent = profitFormatRmb(values.otherCost); elements.profitAcquiringFeeValue.textContent = profitFormatRmb(values.acquiringFee ?? 0); elements.profitExpensesValue.textContent = profitFormatRmb(values.expenses); elements.profitValue.parentElement.classList.toggle('negative', values.profit < 0); }
      function profitRender(data) {
        profitUpdateSellingPriceHint(); const missing = profitBaseValidation(data); const selection = profitSelectRoute(data); elements.profitWarningBox.hidden = true; elements.profitWarningBox.className = 'profit-warning';
        if (missing.length) { profitSetStatus('请完善输入', 'warn'); elements.profitRouteValue.textContent = '—'; elements.profitChargeableWeightValue.textContent = '0.000 kg'; elements.profitRouteMessage.textContent = '需要填写完整的售价、尺寸、重量、成本和汇率。'; profitUpdateNumbers({ revenue: 0, commission: 0, acquiringFee: 0, shipping: 0, expenses: 0, productCost: data.productCost, adCost: data.adCost, otherCost: data.otherCost, profit: 0, margin: 0 }); elements.profitRecommendedPriceValue.textContent = '—'; elements.profitTargetResultMessage.textContent = '先完善输入信息。'; return; }
        if (!selection.eligible || !selection.fee) { profitSetStatus('超出线路限制', 'bad'); elements.profitRouteValue.textContent = selection.route ? selection.route.label : '没有可用线路'; elements.profitChargeableWeightValue.textContent = '—'; elements.profitRouteMessage.textContent = '当前尺寸、重量或货值不符合所选 Economy 线路。请切换自动匹配或修改输入。'; profitUpdateNumbers({ revenue: 0, commission: 0, shipping: 0, expenses: data.productCost + data.adCost + data.otherCost, productCost: data.productCost, adCost: data.adCost, otherCost: data.otherCost, profit: 0, margin: 0 }); elements.profitWarningBox.hidden = false; elements.profitWarningBox.className = 'profit-warning error'; elements.profitWarningBox.textContent = '当前输入无法按所选线路发货，利润结果不作为有效报价。'; elements.profitRecommendedPriceValue.textContent = '—'; elements.profitTargetResultMessage.textContent = '请先选择可用线路或调整商品信息。'; return; }
        const result = profitCalculateAtPrice(data.sellingPrice, data); const route = selection.route; profitSetStatus(result.profit >= 0 ? '可盈利' : '亏损', result.profit >= 0 ? 'good' : 'bad'); elements.profitRouteValue.textContent = route.label; elements.profitChargeableWeightValue.textContent = profitFormatKg(result.selection.fee.value); elements.profitRouteMessage.textContent = `${route.rule}。体积重 ${result.selection.fee.volumeWeight.toFixed(3)} kg，资费 ${route.rate.toFixed(1)} × kg + ${route.fixed.toFixed(2)} 元/票。`; profitUpdateNumbers({ revenue: result.revenue, commission: result.commission, acquiringFee: result.acquiringFee, shipping: result.selection.fee.shipping, expenses: result.expenses, productCost: data.productCost, adCost: data.adCost, otherCost: data.otherCost, profit: result.profit, margin: result.margin });
        const recommended = profitFindRecommendedPrice(data); if (recommended) { elements.profitRecommendedPriceValue.textContent = profitFormatPricePair(recommended.sellingPrice / data.exchangeRate, recommended.sellingPrice); elements.profitTargetResultMessage.textContent = `${PROFIT_ROUTES[recommended.selection.key].label}，预计利润 ${profitFormatRmb(recommended.profit)}。`; } else { elements.profitRecommendedPriceValue.textContent = '无法达到'; elements.profitTargetResultMessage.textContent = '在当前线路的最高货值范围内，无法达到目标利润。'; }
        const notices = []; if (selection.eligibleRoutes.length > 1 && data.routeMode === 'auto') notices.push(`自动匹配在 ${selection.eligibleRoutes.length} 条可用线路中选择了费用最低的线路。`); if (data.sellingPrice === 7000 && selection.key === 'big') notices.push('售价为 7,000 卢布时按表格边界使用实际重量；提高到 7,001 卢布会切换到 Premium 线路，物流费可能明显增加。'); if (notices.length) { elements.profitWarningBox.hidden = false; elements.profitWarningBox.textContent = notices.join(' '); }
      }
      function profitCalculate() { profitRender(profitReadInputs()); }
      function profitCopyResult() { const data = profitReadInputs(); const result = profitCalculateAtPrice(data.sellingPrice, data); const text = [`${data.productName || '商品'}利润核算`, `售价：${data.sellingPriceRmb.toFixed(2)} 元（约 ${Math.ceil(data.sellingPrice).toLocaleString('zh-CN')} 卢布）`, `线路：${result.valid ? result.selection.route.label : '超出线路限制'}`, `物流费：${profitFormatRmb(result.valid ? result.selection.fee.shipping : 0)}`, `平台佣金：${profitFormatRmb(result.valid ? result.commission : 0)}`, `收单业务费（2%）：${profitFormatRmb(result.valid ? result.acquiringFee : 0)}`, `商品成本：${profitFormatRmb(data.productCost)}`, `广告及其他：${profitFormatRmb(data.adCost + data.otherCost)}`, `预计利润：${profitFormatRmb(result.valid ? result.profit : 0)}`].join('\n'); const done = () => { elements.profitCopyFeedback.textContent = '已复制到剪贴板'; setTimeout(() => { elements.profitCopyFeedback.textContent = ''; }, 2200); }; if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => { elements.profitCopyFeedback.textContent = '浏览器未允许自动复制，请手动查看结果'; }); else elements.profitCopyFeedback.textContent = '当前浏览器不支持自动复制，请手动查看结果'; }

      // OGL 的克费率与 Economy kg 费率分开计算，避免单位换算影响现有利润模块。
      const OGL_ROUTES = {
        extraSmall: { label: 'Extra Small', minWeight: 1, maxWeight: 500, minValue: 1, maxValue: 1500, fixed: 2.9, rate: 0.0247, volumetric: false },
        budget: { label: 'Budget', minWeight: 501, maxWeight: 35000, minValue: 1, maxValue: 1500, fixed: 22.25, rate: 0.0164, volumetric: false },
        small: { label: 'Small', minWeight: 1, maxWeight: 2000, minValue: 1501, maxValue: 7000, fixed: 15.48, rate: 0.0242, volumetric: false },
        big: { label: 'Big', minWeight: 2001, maxWeight: 35000, minValue: 1501, maxValue: 7000, fixed: 34.82, rate: 0.0164, volumetric: true },
        premiumSmall: { label: 'Premium Small', minWeight: 1, maxWeight: 5000, minValue: 7001, maxValue: 250000, fixed: 21.28, rate: 0.0242, volumetric: false },
        premiumBig: { label: 'Premium Big', minWeight: 5001, maxWeight: 35000, minValue: 7001, maxValue: 250000, fixed: 59.97, rate: 0.0222, volumetric: true }
      };
      const OGL_DEFAULTS = { productName: 'OGL 商品示例', sellingPriceRmb: 7000 / 11.5, length: 48, width: 52, height: 50, actualWeight: 7.9, productCost: 175, commissionRate: 10, adCost: 0, otherCost: 0, routeMode: 'auto', targetProfit: 250 };

      function oglReadNumber(element) { const value = Number(element?.value); return Number.isFinite(value) ? value : 0; }
      function oglSetValues(values) { Object.entries(values).forEach(([key, value]) => { const input = elements[`ogl${key.charAt(0).toUpperCase()}${key.slice(1)}`]; if (input) input.value = value; }); }
      function oglReadInputs() {
        const sellingPriceRmb = oglReadNumber(elements.oglSellingPriceRmb);
        const exchangeRate = profitReadNumber(elements.profitExchangeRate);
        return { productName: elements.oglProductName.value.trim(), sellingPriceRmb, sellingPrice: sellingPriceRmb * exchangeRate, length: oglReadNumber(elements.oglLength), width: oglReadNumber(elements.oglWidth), height: oglReadNumber(elements.oglHeight), actualWeight: oglReadNumber(elements.oglActualWeight), productCost: oglReadNumber(elements.oglProductCost), commissionRate: oglReadNumber(elements.oglCommissionRate), adCost: oglReadNumber(elements.oglAdCost), otherCost: oglReadNumber(elements.oglOtherCost), exchangeRate, routeMode: elements.oglRouteMode.value, targetProfit: oglReadNumber(elements.oglTargetProfit) };
      }
      function oglWeightGrams(data) { return data.actualWeight * 1000; }
      function oglRublePrice(value) {
        const rounded = Math.round((Number(value) + Number.EPSILON) * 100) / 100;
        return Math.ceil(rounded - 1e-9);
      }
      function oglParcelRestrictionMessage(data) {
        const issues = [];
        if (data.actualWeight > 35) issues.push('货件重量不得超过 35 kg');
        const sides = [data.length, data.width, data.height].sort((a, b) => b - a);
        if (sides[0] > 200 || sides[1] > 80 || sides[2] > 80) issues.push('含包装尺寸不得超过 200 × 80 × 80 cm（最长边不超过 200 cm）');
        if (data.length * data.width * data.height / 1000 > 500) issues.push('含包装体积不得超过 500 L');
        return issues.join('；');
      }
      function oglChargeableWeight(key, data) { const actualGrams = oglWeightGrams(data); const volumeGrams = data.length * data.width * data.height / 12000 * 1000; return { actualGrams, volumeGrams, billableGrams: Math.ceil(OGL_ROUTES[key].volumetric ? Math.max(actualGrams, volumeGrams) : actualGrams) }; }
      function oglRouteEligible(key, data) { const route = OGL_ROUTES[key]; const grams = Math.ceil(oglWeightGrams(data)); const rublePrice = oglRublePrice(data.sellingPrice); return !oglParcelRestrictionMessage(data) && rublePrice >= route.minValue && rublePrice <= route.maxValue && grams >= route.minWeight && grams <= route.maxWeight; }
      function oglRouteFee(key, data) { const route = OGL_ROUTES[key]; const weight = oglChargeableWeight(key, data); return { ...weight, shipping: route.fixed + weight.billableGrams * route.rate }; }
      function oglSelectRoute(data) {
        const eligible = Object.keys(OGL_ROUTES).filter((key) => oglRouteEligible(key, data));
        if (data.routeMode !== 'auto') return { key: data.routeMode, route: OGL_ROUTES[data.routeMode], eligible: oglRouteEligible(data.routeMode, data), eligibleRoutes: eligible, fee: oglRouteEligible(data.routeMode, data) ? oglRouteFee(data.routeMode, data) : null };
        if (!eligible.length) return { key: null, route: null, eligible: false, eligibleRoutes: [], fee: null };
        const key = eligible.reduce((best, candidate) => !best || oglRouteFee(candidate, data).shipping < oglRouteFee(best, data).shipping ? candidate : best, null);
        return { key, route: OGL_ROUTES[key], eligible: true, eligibleRoutes: eligible, fee: oglRouteFee(key, data) };
      }
      function oglBaseValidation(data) {
        const missing = [];
        ['length', 'width', 'height', 'actualWeight'].forEach((key) => { if (data[key] <= 0) missing.push(key); });
        if (data.productCost < 0) missing.push('productCost');
        ['adCost', 'otherCost'].forEach((key) => { if (data[key] < 0) missing.push(key); });
        if (data.sellingPriceRmb <= 0 || data.exchangeRate <= 0 || data.commissionRate < 0 || data.commissionRate + OGL_VARIABLE_FEE_RATE * 100 >= 100) missing.push('priceOrRate');
        return missing;
      }
      function oglCalculateAtPrice(price, baseData) {
        const data = { ...baseData, sellingPrice: price };
        const selection = oglSelectRoute(data);
        if (!selection.eligible || !selection.fee) return { ...data, selection, valid: false };
        const revenue = price / data.exchangeRate;
        const commission = revenue * data.commissionRate / 100;
        const acquiringFee = revenue * PROFIT_ACQUIRING_FEE_RATE;
        const logisticsPlatformFee = revenue * OGL_LOGISTICS_PLATFORM_FEE_RATE;
        const transportContractFee = revenue * OGL_TRANSPORT_CONTRACT_FEE_RATE;
        const starAdsFee = revenue * OGL_STAR_ADS_FEE_RATE;
        const expenses = data.productCost + selection.fee.shipping + commission + acquiringFee + logisticsPlatformFee + transportContractFee + starAdsFee + data.adCost + data.otherCost;
        return { ...data, selection, valid: true, revenue, commission, acquiringFee, logisticsPlatformFee, transportContractFee, starAdsFee, expenses, profit: revenue - expenses, margin: revenue ? (revenue - expenses) / revenue : 0 };
      }
      function oglUpdateNumbers(values) {
        elements.oglProfitValue.textContent = profitFormatRmb(values.profit);
        elements.oglProfitMarginValue.textContent = `利润率 ${(values.margin * 100).toFixed(1)}%`;
        elements.oglRevenueValue.textContent = profitFormatRmb(values.revenue);
        elements.oglCommissionValue.textContent = profitFormatRmb(values.commission);
        elements.oglShippingValue.textContent = profitFormatRmb(values.shipping);
        elements.oglTotalCostValue.textContent = profitFormatRmb(values.expenses);
        elements.oglProductCostValue.textContent = profitFormatRmb(values.productCost);
        elements.oglAdCostValue.textContent = profitFormatRmb(values.adCost);
        elements.oglOtherCostValue.textContent = profitFormatRmb(values.otherCost);
        elements.oglLogisticsPlatformFeeValue.textContent = profitFormatRmb(values.logisticsPlatformFee ?? 0);
        elements.oglTransportContractFeeValue.textContent = profitFormatRmb(values.transportContractFee ?? 0);
        elements.oglStarAdsFeeValue.textContent = profitFormatRmb(values.starAdsFee ?? 0);
        elements.oglAcquiringFeeValue.textContent = profitFormatRmb(values.acquiringFee ?? 0);
        elements.oglExpensesValue.textContent = profitFormatRmb(values.expenses);
        elements.oglProfitValue.parentElement.classList.toggle('negative', values.profit < 0);
      }
      function oglFindRecommendedPrice(data) {
        const target = Math.max(0, data.targetProfit);
        const routeEntries = data.routeMode === 'auto' ? Object.entries(OGL_ROUTES) : [[data.routeMode, OGL_ROUTES[data.routeMode]]];
        const candidates = [];
        for (const [key, route] of routeEntries) {
          const routeData = { ...data, routeMode: key };
          const routeWeight = oglRouteFee(key, { ...routeData, sellingPrice: route.minValue });
          const totalFixedCosts = data.productCost + routeWeight.shipping + data.adCost + data.otherCost + target;
          const requiredRevenue = totalFixedCosts / (1 - data.commissionRate / 100 - OGL_VARIABLE_FEE_RATE);
          const price = Math.max(route.minValue, Math.ceil(requiredRevenue * data.exchangeRate));
          const sellingPriceRmb = Math.ceil((price / data.exchangeRate) * 100 - 1e-9) / 100;
          const candidate = oglCalculateAtPrice(sellingPriceRmb * data.exchangeRate, { ...routeData, sellingPriceRmb });
          if (oglRublePrice(candidate.sellingPrice) <= route.maxValue && candidate.valid && candidate.profit >= target - 1e-9) candidates.push(candidate);
        }
        candidates.sort((a, b) => a.sellingPrice - b.sellingPrice || a.selection.fee.shipping - b.selection.fee.shipping);
        return candidates[0] || null;
      }
      function oglUpdatePriceHint() { const rate = profitReadNumber(elements.profitExchangeRate); elements.oglSellingPriceRubHint.textContent = rate > 0 ? `折合约 ${oglRublePrice(oglReadNumber(elements.oglSellingPriceRmb) * rate).toLocaleString('zh-CN')} ₽` : '等待汇率'; }
      function oglSetStatus(text, kind = '') { elements.oglStatusBadge.textContent = text; elements.oglStatusBadge.className = `profit-status${kind ? ` ${kind}` : ''}`; }
      function oglRender(data = oglReadInputs()) {
        const rate = data.exchangeRate;
        oglUpdatePriceHint();
        elements.oglExchangeRateValue.textContent = rate.toFixed(4);
        elements.oglRateStatus.textContent = `${state.profitRateState.source} · ${state.profitRateState.updatedAt}`;
        const missing = oglBaseValidation(data);
        const selection = oglSelectRoute(data);
        elements.oglWarningBox.hidden = true;
        elements.oglWarningBox.className = 'profit-warning';
        if (missing.length) {
          oglSetStatus('请完善输入', 'warn');
          elements.oglRouteValue.textContent = '—';
          elements.oglChargeableWeightValue.textContent = '0 g';
          elements.oglRouteMessage.textContent = '需要填写有效的售价、尺寸、重量、成本和平台佣金。';
          oglUpdateNumbers({ prefix: 'ogl', profit: 0, margin: 0, revenue: 0, commission: 0, shipping: 0, expenses: 0, productCost: data.productCost, adCost: data.adCost, otherCost: data.otherCost, logisticsPlatformFee: 0, transportContractFee: 0, starAdsFee: 0, acquiringFee: 0 });
          elements.oglRecommendedPriceValue.textContent = '—'; elements.oglTargetResultMessage.textContent = '先完善输入信息。'; return;
        }
        if (!selection.eligible || !selection.fee) {
          oglSetStatus('超出 OGL 线路范围', 'bad');
          elements.oglRouteValue.textContent = selection.route?.label || '没有可用线路';
          elements.oglChargeableWeightValue.textContent = '—';
          const restrictionMessage = oglParcelRestrictionMessage(data);
          elements.oglRouteMessage.textContent = restrictionMessage || '当前货值或重量不符合所选 OGL 线路。请改用自动匹配或调整商品参数。';
          oglUpdateNumbers({ prefix: 'ogl', profit: 0, margin: 0, revenue: 0, commission: 0, shipping: 0, expenses: data.productCost + data.adCost + data.otherCost, productCost: data.productCost, adCost: data.adCost, otherCost: data.otherCost, logisticsPlatformFee: 0, transportContractFee: 0, starAdsFee: 0, acquiringFee: 0 });
          elements.oglWarningBox.hidden = false; elements.oglWarningBox.className = 'profit-warning error'; elements.oglWarningBox.textContent = restrictionMessage || '当前商品不符合所选 OGL 线路，请切换线路或调整售价、重量。';
          elements.oglRecommendedPriceValue.textContent = '—'; elements.oglTargetResultMessage.textContent = '当前所选线路不适用。'; return;
        }
        const result = oglCalculateAtPrice(data.sellingPrice, data);
        oglSetStatus(result.profit >= 0 ? '可盈利' : '亏损', result.profit >= 0 ? 'good' : 'bad');
        elements.oglRouteValue.textContent = selection.route.label;
        elements.oglChargeableWeightValue.textContent = `${selection.fee.billableGrams.toLocaleString('zh-CN')} g`;
        elements.oglRouteMessage.textContent = `${selection.route.volumetric ? `包装后重量 ${selection.fee.actualGrams.toFixed(0)} g，体积重 ${selection.fee.volumeGrams.toFixed(0)} g，按较高值计费。` : '按包装后重量计费。'}时效 13–17 天；${selection.route.fixed.toFixed(2)} + ${selection.route.rate.toFixed(4)} × ${selection.fee.billableGrams} g。`;
        oglUpdateNumbers({ prefix: 'ogl', profit: result.profit, margin: result.margin, revenue: result.revenue, commission: result.commission, shipping: selection.fee.shipping, expenses: result.expenses, productCost: data.productCost, adCost: data.adCost, otherCost: data.otherCost, logisticsPlatformFee: result.logisticsPlatformFee, transportContractFee: result.transportContractFee, starAdsFee: result.starAdsFee, acquiringFee: result.acquiringFee });
        const recommended = oglFindRecommendedPrice(data);
        if (recommended) { elements.oglRecommendedPriceValue.textContent = profitFormatPricePair(recommended.sellingPriceRmb, recommended.sellingPrice); elements.oglTargetResultMessage.textContent = `${recommended.selection.route.label}，按人民币分位实际输入金额核算，预计利润 ${profitFormatRmb(recommended.profit)}。`; }
        else { elements.oglRecommendedPriceValue.textContent = '无法达到'; elements.oglTargetResultMessage.textContent = '在 OGL 线路货值上限内无法达到目标利润。'; }
      }
      function oglCopyResult() {
        const data = oglReadInputs();
        if (oglBaseValidation(data).length) {
          elements.oglCopyFeedback.textContent = '请先完善有效输入';
          setTimeout(() => { elements.oglCopyFeedback.textContent = ''; }, 2200);
          return;
        }
        const result = oglCalculateAtPrice(data.sellingPrice, data);
        const text = [`${data.productName || '商品'} OGL 利润核算`, `售价：${data.sellingPriceRmb.toFixed(2)} 元（约 ${oglRublePrice(data.sellingPrice).toLocaleString('zh-CN')} 卢布）`, `线路：${result.valid ? result.selection.route.label : '超出线路限制'}`, `计费重量：${result.valid ? result.selection.fee.billableGrams : 0} g`, `OGL 物流费：${profitFormatRmb(result.valid ? result.selection.fee.shipping : 0)}`, `平台佣金：${profitFormatRmb(result.valid ? result.commission : 0)}`, `接入 Ozon 物流平台的电子服务（2%）：${profitFormatRmb(result.valid ? result.logisticsPlatformFee : 0)}`, `组织国际运输合同的订立服务（0.35%）：${profitFormatRmb(result.valid ? result.transportContractFee : 0)}`, `星星计划广告（1.5%）：${profitFormatRmb(result.valid ? result.starAdsFee : 0)}`, `收单业务费（2%）：${profitFormatRmb(result.valid ? result.acquiringFee : 0)}`, `商品成本：${profitFormatRmb(data.productCost)}`, `广告及其他：${profitFormatRmb(data.adCost + data.otherCost)}`, `预计利润：${profitFormatRmb(result.valid ? result.profit : 0)}`].join('\n');
        const done = () => { elements.oglCopyFeedback.textContent = '已复制到剪贴板'; setTimeout(() => { elements.oglCopyFeedback.textContent = ''; }, 2200); };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(() => { elements.oglCopyFeedback.textContent = '浏览器未允许自动复制'; });
        else elements.oglCopyFeedback.textContent = '当前浏览器不支持自动复制';
      }

      function setActiveModule(moduleName) {
        const logisticsActive = moduleName === 'logistics';
        const fbsActive = moduleName === 'fbs';
        const commissionActive = moduleName === 'commission';
        const expenseActive = moduleName === 'expense';
        const ozonRatesActive = moduleName === 'ozonRates';
        const profitActive = moduleName === 'profit';
        const oglActive = moduleName === 'ogl';
        elements.salesModule.hidden = logisticsActive || fbsActive || commissionActive || expenseActive || ozonRatesActive || profitActive || oglActive;
        elements.logisticsModule.hidden = !logisticsActive;
        elements.fbsModule.hidden = !fbsActive;
        elements.commissionModule.hidden = !commissionActive;
        elements.expenseModule.hidden = !expenseActive;
        elements.ozonCommissionTableModule.hidden = !ozonRatesActive;
        elements.profitModule.hidden = !profitActive && !oglActive;
        elements.profitStandardPanel.hidden = oglActive;
        elements.oglModule.hidden = !oglActive;
        elements.salesNavButton.classList.toggle('active', !logisticsActive && !fbsActive && !commissionActive && !expenseActive && !ozonRatesActive && !profitActive && !oglActive);
        elements.logisticsNavButton.classList.toggle('active', logisticsActive);
        elements.fbsNavButton.classList.toggle('active', fbsActive);
        elements.commissionNavButton.classList.toggle('active', commissionActive);
        elements.expenseNavButton.classList.toggle('active', expenseActive);
        elements.ozonRatesNavButton.classList.toggle('active', ozonRatesActive);
        elements.profitNavButton.classList.toggle('active', profitActive);
        elements.oglNavButton.classList.toggle('active', oglActive);
        elements.salesNavButton.setAttribute('aria-current', !logisticsActive && !fbsActive && !commissionActive && !expenseActive && !ozonRatesActive && !profitActive && !oglActive ? 'page' : 'false');
        elements.logisticsNavButton.setAttribute('aria-current', logisticsActive ? 'page' : 'false');
        elements.fbsNavButton.setAttribute('aria-current', fbsActive ? 'page' : 'false');
        elements.commissionNavButton.setAttribute('aria-current', commissionActive ? 'page' : 'false');
        elements.expenseNavButton.setAttribute('aria-current', expenseActive ? 'page' : 'false');
        elements.ozonRatesNavButton.setAttribute('aria-current', ozonRatesActive ? 'page' : 'false');
        elements.profitNavButton.setAttribute('aria-current', profitActive ? 'page' : 'false');
        elements.oglNavButton.setAttribute('aria-current', oglActive ? 'page' : 'false');
        elements.pageBreadcrumb.textContent = logisticsActive ? '物流费' : fbsActive ? 'FBS运费' : commissionActive ? '佣金' : expenseActive ? '支出' : ozonRatesActive ? 'Ozon佣金表' : oglActive ? '利润核算 OGL' : profitActive ? '利润核算' : '销售报告';
      }

      function parseFile(file) {
        return new Promise((resolve, reject) => {
          const extension = file.name.split('.').pop().toLowerCase();
          if (!['xlsx', 'xls', 'csv'].includes(extension)) {
            reject(new Error(`${file.name}：格式不支持，请使用 .xlsx、.xls 或 .csv。`));
            return;
          }
          if (typeof XLSX === 'undefined') {
            reject(new Error('Excel 解析组件未加载，请检查 vendor/xlsx.full.min.js 是否存在。'));
            return;
          }
          const reader = new FileReader();
          reader.onload = (event) => {
            try {
              const workbook = XLSX.read(new Uint8Array(event.target.result), { type: 'array', cellDates: true });
              const analysis = findMatches(workbook);
              const { matches, sheetData, periodRows } = analysis;
              if (!matches.length) throw new Error(`未找到字段“${TARGET_LABEL}”。`);
              const reportMatchesTotal = matches.reduce((sum, match) => sum + match.value, 0);
              resolve({
                id: `${file.name}|${file.size}|${file.lastModified}`,
                fileName: file.name,
                fileSize: file.size,
                importedAt: Date.now(),
                sheetData,
                rowCount: sheetData.reduce((sum, item) => sum + item.rowCount, 0),
                matches,
                total: reportMatchesTotal,
                period: inferPeriodMeta(periodRows, file.name)
              });
            } catch (error) {
              reject(new Error(`${file.name}：${error.message || '解析失败'}`));
            }
          };
          reader.onerror = () => reject(new Error(`${file.name}：文件读取失败。`));
          reader.readAsArrayBuffer(file);
        });
      }

      async function handleFiles(fileList) {
        const files = [...(fileList || [])];
        if (!files.length) return;
        const importRevision = state.importRevision;
        const results = await Promise.allSettled(files.map(parseFile));
        if (importRevision !== state.importRevision) return;
        const existing = new Set(state.reports.map((report) => report.id));
        const batchIds = new Set();
        const added = results.filter((result) => {
          if (result.status !== 'fulfilled' || existing.has(result.value.id) || batchIds.has(result.value.id)) return false;
          batchIds.add(result.value.id);
          return true;
        }).map((result) => result.value);
        let persistenceWarning = '';
        const database = await state.databasePromise;
        if (added.length && database) {
          try {
            await storeReports(database, added);
          } catch {
            persistenceWarning = '导入成功，但本地保存失败，刷新页面后这些报告可能丢失。';
          }
        } else if (added.length) {
          persistenceWarning = '本地保存不可用，刷新页面后这些报告可能丢失。';
        }
        if (importRevision !== state.importRevision) return;
        state.reports.push(...added);
        const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason.message);
        const duplicates = results.filter((result) => result.status === 'fulfilled' && existing.has(result.value.id)).length;
        elements.fileInput.value = '';
        if (state.reports.length) renderDashboard();
        if (failures.length || duplicates || persistenceWarning) {
          const message = [...failures, ...(duplicates ? [`${duplicates} 份重复文件已跳过。`] : []), persistenceWarning].filter(Boolean).join(' ');
          showToast(message);
        } else if (added.length) {
          showToast(`已导入并保存在本地的 ${added.length} 份报告；刷新页面后仍会保留。`);
        }
      }

      state.databasePromise = initializeReports();
      state.logisticsDatabasePromise = initializeLogisticsReports();
      state.fbsDatabasePromise = initializeFbsReports();
      state.commissionDatabasePromise = initializeCommissionReports();
      state.expenseDatabasePromise = initializeExpenseReports();
      state.ozonRatesDatabasePromise = initializeOzonRates();
      elements.salesNavButton.addEventListener('click', () => setActiveModule('sales'));
      elements.logisticsNavButton.addEventListener('click', () => setActiveModule('logistics'));
      elements.fbsNavButton.addEventListener('click', () => setActiveModule('fbs'));
      elements.commissionNavButton.addEventListener('click', () => setActiveModule('commission'));
      elements.expenseNavButton.addEventListener('click', () => setActiveModule('expense'));
      elements.ozonRatesNavButton.addEventListener('click', () => setActiveModule('ozonRates'));
      elements.profitNavButton.addEventListener('click', () => setActiveModule('profit'));
      elements.oglNavButton.addEventListener('click', () => setActiveModule('ogl'));
      elements.chooseButton.addEventListener('click', () => elements.fileInput.click());
      elements.fileInput.addEventListener('change', (event) => handleFiles(event.target.files));
      elements.clearButton.addEventListener('click', resetView);
      elements.logisticsChooseButton.addEventListener('click', () => elements.logisticsFileInput.click());
      elements.logisticsFileInput.addEventListener('change', (event) => handleLogisticsFiles(event.target.files));
      elements.logisticsClearButton.addEventListener('click', resetLogisticsView);
      elements.fbsChooseButton.addEventListener('click', () => elements.fbsFileInput.click());
      elements.fbsFileInput.addEventListener('change', (event) => handleFbsFiles(event.target.files));
      elements.fbsClearButton.addEventListener('click', resetFbsView);
      elements.commissionChooseButton.addEventListener('click', () => elements.commissionFileInput.click());
      elements.commissionFileInput.addEventListener('change', (event) => handleCommissionFiles(event.target.files));
      elements.commissionClearButton.addEventListener('click', resetCommissionView);
      elements.expenseForm.addEventListener('submit', handleExpenseSubmit);
      elements.expenseClearButton.addEventListener('click', resetExpenseView);
      elements.expenseDetailBody.addEventListener('click', (event) => {
        const copyButton = event.target.closest('[data-copy-expense-id]');
        if (copyButton) {
          copyExpense(copyButton.dataset.copyExpenseId);
          return;
        }
        const button = event.target.closest('[data-expense-id]');
        if (button) deleteExpense(button.dataset.expenseId);
      });
      elements.expenseDateInput.value = localDateInputValue();
      ['dragenter', 'dragover'].forEach((eventName) => elements.dropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropzone.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach((eventName) => elements.dropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.dropzone.classList.remove('dragover'); }));
      elements.dropzone.addEventListener('drop', (event) => handleFiles(event.dataTransfer.files));
      elements.dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.fileInput.click(); } });
      ['dragenter', 'dragover'].forEach((eventName) => elements.logisticsDropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.logisticsDropzone.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach((eventName) => elements.logisticsDropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.logisticsDropzone.classList.remove('dragover'); }));
      elements.logisticsDropzone.addEventListener('drop', (event) => handleLogisticsFiles(event.dataTransfer.files));
      elements.logisticsDropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.logisticsFileInput.click(); } });
      ['dragenter', 'dragover'].forEach((eventName) => elements.fbsDropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.fbsDropzone.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach((eventName) => elements.fbsDropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.fbsDropzone.classList.remove('dragover'); }));
      elements.fbsDropzone.addEventListener('drop', (event) => handleFbsFiles(event.dataTransfer.files));
      elements.fbsDropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.fbsFileInput.click(); } });
      ['dragenter', 'dragover'].forEach((eventName) => elements.commissionDropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.commissionDropzone.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach((eventName) => elements.commissionDropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.commissionDropzone.classList.remove('dragover'); }));
      elements.commissionDropzone.addEventListener('drop', (event) => handleCommissionFiles(event.dataTransfer.files));
      elements.commissionDropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.commissionFileInput.click(); } });
      elements.ozonRatesChooseButton.addEventListener('click', () => elements.ozonRatesFileInput.click());
      elements.ozonRatesFileInput.addEventListener('change', (event) => handleOzonRatesFile(event.target.files[0]));
      elements.ozonRatesClearButton.addEventListener('click', clearOzonRates);
      elements.ozonRatesSearchInput.addEventListener('input', (event) => { state.ozonRatesSearch = event.target.value.trim(); state.ozonRatesPage = 0; if (state.ozonRatesDataset) renderOzonRatesTable(); });
      elements.ozonRatesSheetFilter.addEventListener('change', (event) => { state.ozonRatesSheetName = event.target.value; state.ozonRatesPage = 0; state.ozonRatesCategory = ''; renderOzonRatesTable(); });
      elements.ozonRatesCategoryFilter.addEventListener('input', (event) => { state.ozonRatesCategory = event.target.value.trim(); state.ozonRatesPage = 0; if (state.ozonRatesDataset) renderOzonRatesTable(); });
      elements.ozonRatesResetFiltersButton.addEventListener('click', () => { state.ozonRatesSearch = ''; state.ozonRatesCategory = ''; state.ozonRatesPage = 0; elements.ozonRatesSearchInput.value = ''; elements.ozonRatesCategoryFilter.value = ''; if (state.ozonRatesDataset) renderOzonRatesTable(); });
      elements.ozonRatesPrevButton.addEventListener('click', () => { state.ozonRatesPage = Math.max(0, state.ozonRatesPage - 1); renderOzonRatesTable(); });
      elements.ozonRatesNextButton.addEventListener('click', () => { state.ozonRatesPage += 1; renderOzonRatesTable(); });
      ['dragenter', 'dragover'].forEach((eventName) => elements.ozonRatesDropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.ozonRatesDropzone.classList.add('dragover'); }));
      ['dragleave', 'drop'].forEach((eventName) => elements.ozonRatesDropzone.addEventListener(eventName, (event) => { event.preventDefault(); elements.ozonRatesDropzone.classList.remove('dragover'); }));
      elements.ozonRatesDropzone.addEventListener('drop', (event) => handleOzonRatesFile(event.dataTransfer.files[0]));
      elements.ozonRatesDropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.ozonRatesFileInput.click(); } });

      profitSetValues(PROFIT_DEFAULTS);
      ['profitProductName', 'profitLength', 'profitWidth', 'profitHeight', 'profitActualWeight', 'profitProductCost', 'profitCommissionRate', 'profitAdCost', 'profitOtherCost', 'profitTargetProfit'].forEach((key) => elements[key].addEventListener('input', profitCalculate));
      elements.profitSellingPriceRmb.addEventListener('input', () => { state.profitHasUserEditedPrice = true; profitUpdateSellingPriceHint(); profitCalculate(); });
      elements.profitExchangeRate.addEventListener('input', () => { profitUpdateSellingPriceHint(); profitCalculate(); oglRender(); });
      elements.profitRouteMode.addEventListener('change', profitCalculate);
      elements.profitExampleButton.addEventListener('click', () => { const rate = profitReadNumber(elements.profitExchangeRate) || PROFIT_FALLBACK_RATE; state.profitHasUserEditedPrice = false; profitSetValues({ ...PROFIT_DEFAULTS, sellingPriceRmb: PROFIT_DEFAULT_RUB_PRICE / rate, exchangeRate: rate }); profitUpdateSellingPriceHint(); profitCalculate(); });
      elements.profitCopyButton.addEventListener('click', profitCopyResult);
      elements.profitRefreshRateButton.addEventListener('click', () => profitUpdateExchangeRate(true));
      const oglInitialRate = profitReadNumber(elements.profitExchangeRate) || PROFIT_FALLBACK_RATE;
      oglSetValues({ ...OGL_DEFAULTS, sellingPriceRmb: PROFIT_DEFAULT_RUB_PRICE / oglInitialRate });
      ['oglProductName', 'oglLength', 'oglWidth', 'oglHeight', 'oglActualWeight', 'oglProductCost', 'oglCommissionRate', 'oglAdCost', 'oglOtherCost', 'oglTargetProfit'].forEach((key) => elements[key].addEventListener('input', () => oglRender()));
      elements.oglSellingPriceRmb.addEventListener('input', () => { state.oglHasUserEditedPrice = true; oglRender(); });
      elements.oglRouteMode.addEventListener('change', oglRender);
      elements.oglExampleButton.addEventListener('click', () => { const rate = profitReadNumber(elements.profitExchangeRate) || PROFIT_FALLBACK_RATE; state.oglHasUserEditedPrice = false; oglSetValues({ ...OGL_DEFAULTS, sellingPriceRmb: PROFIT_DEFAULT_RUB_PRICE / rate }); oglRender(); });
      elements.oglCopyButton.addEventListener('click', oglCopyResult);
      profitUpdateSellingPriceHint();
      profitCalculate();
      oglRender();
      profitUpdateExchangeRate().finally(profitScheduleDailyRateRefresh);

    })();
  
