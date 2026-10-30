# Ozon 选品采集助手

这是当前项目的浏览器扩展部分。它只在用户点击“采集当前商品”时读取当前 Ozon 商品页的可见内容，不读取密码、Cookie 或认证令牌。

## 使用方法

1. 站内下载的最新版已经默认使用 https://ozon-dashboard-nextjs-migration.vercel.app/product-capture；如果使用自定义域名，再打开 extension/config.js 修改 OZON_CAPTURE_APP_URL。
2. 打开 Chrome 或 Edge 的扩展管理页，开启“开发者模式”。
3. 选择“加载已解压的扩展”，选择本目录的 extension 文件夹。
4. 打开项目的 /product-capture 页面。
5. 打开 Ozon 商品详情页，点击右下角“采集当前商品”。
6. 检查预览后点击“打开选品页”，记录会写入浏览器本地 IndexedDB。
7. 在选品页筛选、补充备注和标签，然后导出 Excel。

## 数据边界

- 选品记录不写入 Neon、Next.js API 或现有店铺数据。
- 记录只保存在当前浏览器的本地 IndexedDB。
- 清除网站数据或更换浏览器后，本地记录可能消失，请及时导出 Excel。
- 当前版本只支持用户主动采集当前商品页；搜索结果批量采集和 1688 图片搜索暂未加入。
