import styles from "./guide.module.css";

// Keep the guide server-rendered so it remains available even before the browser plugin is installed.
export default function ProductCaptureGuidePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OZON PRODUCT CAPTURE · GUIDE</p>
          <h1>插件使用文档</h1>
          <p className={styles.lead}>按下面步骤安装插件、采集 Ozon 商品，并把本地记录导出成 Excel。</p>
        </div>
        <nav className={styles.nav} aria-label="页面导航">
          <a className={styles.primary} href="/downloads/ozon-product-capture-extension.zip" download>下载浏览器插件</a>
          <a href="/product-capture">返回选品采集</a>
          <a href="/">返回 Ozon 工作台</a>
        </nav>
      </header>

      <div className={styles.layout}>
        <aside className={styles.toc}>
          <strong>本文目录</strong>
          <a href="#install">一、下载和安装</a>
          <a href="#configure">二、配置项目地址</a>
          <a href="#capture">三、采集商品</a>
          <a href="#manage">四、管理和导出</a>
          <a href="#storage">五、本地数据说明</a>
          <a href="#troubleshooting">六、常见问题</a>
          <a href="#limits">七、当前版本范围</a>
        </aside>

        <article className={styles.article}>
          <section id="install">
            <h2>一、下载和安装</h2>
            <p>插件目前以 Chrome 116+ / Chromium Edge 的“未打包扩展”方式安装。下载后需要先解压 ZIP，再把解压后的文件夹加载到浏览器。</p>
            <ol>
              <li>点击页面顶部的“下载浏览器插件”。</li>
              <li>把下载的 <code>ozon-product-capture-extension.zip</code> 解压到一个不会被删除的文件夹。</li>
              <li>打开 Chrome 或 Edge 的扩展管理页：地址栏输入 <code>chrome://extensions</code> 或 <code>edge://extensions</code>。</li>
              <li>打开右上角的“开发者模式”。</li>
              <li>点击“加载已解压的扩展”，选择刚才解压出来的文件夹。</li>
              <li>安装成功后，建议点击扩展列表中的图钉，把插件固定到浏览器工具栏。</li>
            </ol>
            <div className={styles.tip}><strong>提示：</strong>浏览器加载的是文件夹，不是 ZIP 文件。以后如果重新下载新版 ZIP，需要先删除旧扩展或重新加载新版文件夹。</div>
          </section>

          <section id="configure">
            <h2>二、配置项目地址</h2>
            <p>插件需要知道把采集结果交给哪个选品页面。站内下载的最新版已经默认指向当前 Vercel 项目；如果你使用了自定义域名，或把项目部署到了其他地址，再用记事本打开扩展文件夹里的 <code>config.js</code> 修改。</p>
            <pre><code>{'globalThis.OZON_CAPTURE_APP_URL = "https://你的域名.vercel.app/product-capture";'}</code></pre>
            <p>当前项目应填写为下面这个地址；如果你使用自定义域名，只替换域名部分，并保留最后的 <code>/product-capture</code>：</p>
            <pre><code>{'globalThis.OZON_CAPTURE_APP_URL = "https://ozon-dashboard-nextjs-migration.vercel.app/product-capture";'}</code></pre>
            <ol>
              <li>保存 <code>config.js</code>。</li>
              <li>回到扩展管理页。</li>
              <li>点击这个插件卡片上的“刷新”按钮。</li>
              <li>重新打开或刷新 Ozon 商品页。</li>
            </ol>
            <div className={styles.warning}><strong>地址要完整：</strong>必须包含 <code>https://</code> 和 <code>/product-capture</code>，不要填写登录页地址，也不要在地址后面添加商品参数。</div>
            <h3>设置自动采集条件</h3>
            <ol>
              <li>点击浏览器右上角的插件图标，打开 Ozon 选品侧栏。</li>
              <li>首次使用先点“先打开 Ozon 首页”读取分类；此时自动采集会暂停。返回侧栏后，从“包含分类”和“排除分类”中选择分类，可多选；留空表示不按分类筛选。</li>
              <li>在“排除品牌”填写不需要的品牌，例如 <code>Apple, Xiaomi</code>。</li>
              <li>按需要填写最低价格、最高价格和最低评分。页面读不到价格或评分时，不会通过对应的限制。</li>
              <li>勾选需要保存的字段。设置只保存在当前浏览器。</li>
            </ol>
            <div className={styles.tip}><strong>筛选规则：</strong>包含分类至少要命中一个关键词；排除分类和排除品牌命中任意一个关键词就会跳过；价格和评分按数值比较，关键词不区分大小写。</div>
          </section>

          <section id="capture">
            <h2>三、采集商品</h2>
            <ol>
              <li>在侧栏输入商品关键词，点击“开启采集并打开 Ozon”；自动采集会开启，Ozon 搜索结果会在当前标签页打开，侧栏仍留在浏览器旁边。</li>
              <li>也可以在侧栏打开 Ozon 首页，然后在网站内搜索和切换分类。</li>
              <li>在 Ozon 中打开商品列表或详情页，例如分类搜索结果或 <code>ozon.ru/product/...</code>。</li>
              <li>等待商品标题、价格和图片加载完成。</li>
              <li>插件会自动读取当前商品，按刚才保存的分类、品牌、价格和评分条件判断。</li>
              <li>列表页中当前已加载且符合条件的商品会自动进入浏览器本地队列；向下滚动后，插件会继续采集新出现的商品卡片。</li>
              <li>打开选品采集页，队列中的记录会自动导入 IndexedDB；选品页可以保持打开，也可以稍后再打开。</li>
              <li>如果只想临时采集一条商品，可以点击商品页右下角的“手动采集”，再打开选品页。</li>
            </ol>
            <h3>插件会尝试读取的内容</h3>
            <ul>
              <li>商品标题、商品链接和商品 ID。</li>
              <li>主图和页面上能读取到的其他图片链接。</li>
              <li>页面价格、解析价格和币种。</li>
              <li>品牌、卖家名称、评分、评价数、销量或库存状态（页面有明确内容时）。</li>
              <li>商品描述摘要、类目和规格（页面结构支持时）。</li>
              <li>采集时间和采集状态。</li>
            </ul>
            <div className={styles.tip}><strong>字段为空不代表商品没有这个信息：</strong>可能是页面还没加载完成、页面结构发生变化、地区页面不同，或者当前版本还没有对应选择器。插件不会把读不到的内容伪造成 0。</div>
          </section>

          <section id="manage">
            <h2>四、管理和导出</h2>
            <p>打开项目的 <a href="/product-capture">选品采集</a> 页面，可以进行以下操作：</p>
            <ul>
              <li>按标题、商品 ID、卖家、标签或备注搜索。</li>
              <li>修改每条记录的备注和标签，然后点击“保存”。</li>
              <li>勾选多条记录后批量删除。</li>
              <li>删除单条记录。</li>
              <li>清空全部本地选品记录。</li>
              <li>导出全部记录，或只导出当前勾选的记录。</li>
            </ul>
            <h3>导出的 Excel 内容</h3>
            <p>Excel 会包含商品链接、商品 ID、标题、图片链接、价格、币种、品牌、卖家、评分、评价数、销量、库存状态、类目、规格、描述摘要、采集时间、状态、备注和标签。弹框里取消保存的字段会留空。</p>
            <div className={styles.tip}><strong>建议：</strong>采集一批商品后及时导出 Excel。图片第一版导出为图片链接，不会把图片文件嵌入 Excel。</div>
          </section>

          <section id="storage">
            <h2>五、本地数据说明</h2>
            <p>这套功能不会把选品数据写入 Neon，也不会调用项目的店铺、订单和销售报告接口。自动采集时，商品会先短暂保存在扩展自己的浏览器队列，打开选品页后再写入当前浏览器的本地 IndexedDB。</p>
            <ul>
              <li>自动队列最多暂存 500 条记录；需要采集大批量商品时，建议保持选品页打开，让记录及时导入。</li>
              <li>换电脑、换浏览器或换浏览器用户配置文件后，记录不会自动出现。</li>
              <li>清除网站数据、使用无痕窗口或浏览器回收本地存储，可能导致记录消失。</li>
              <li>当前本地数据库名称为 <code>ozon-product-capture-v1-local</code>。</li>
              <li>清空选品记录不会删除 Ozon 上的商品，也不会影响项目中的店铺和订单。</li>
              <li>导出的 Excel 文件保存在你的电脑中，与浏览器本地记录互相独立。</li>
            </ul>
          </section>

          <section id="troubleshooting">
            <h2>六、常见问题</h2>
            <div className={styles.faq}>
              <h3>自动采集没有发生</h3>
              <p>点击插件图标检查“启用自动采集”是否勾选，确认当前页面是 Ozon 商品详情页或商品列表页，并刷新扩展和 Ozon 页面。若填写了分类、品牌、价格或评分条件，当前商品不满足条件时会被跳过。</p>
              <h3>看不到“手动采集”按钮</h3>
              <p>商品详情页显示“手动采集”按钮；商品列表页会显示已加入队列的数量。若没看到侧栏，请检查浏览器版本是否为 Chrome 116+ 或新版 Chromium Edge。</p>
              <h3>点击后打开的是 localhost</h3>
              <p>说明还没有修改 <code>config.js</code>。把 <code>OZON_CAPTURE_APP_URL</code> 改成实际部署的 <code>/product-capture</code> 地址，保存后在扩展管理页点击刷新。</p>
              <h3>自动采集的记录没有出现在选品页</h3>
              <p>保持选品页打开几秒，或刷新选品页。浏览器扩展会把本地队列交给选品页，再由选品页写入 IndexedDB。若浏览器禁用了 IndexedDB，请换普通窗口并允许网站保存本地数据。</p>
              <h3>某些字段为空或不准确</h3>
              <p>先等待页面完全加载后重试。Ozon 不同地区和语言的页面结构可能不同，当前版本优先保证标题、链接、图片和价格。没有明确显示的值不会自动推断。</p>
              <h3>导出 Excel 失败</h3>
              <p>检查网络是否允许加载 Excel 导出组件，然后刷新选品页面重试。也可以减少一次导出的记录数量，先按筛选条件分批导出。</p>
              <h3>浏览器提示扩展权限</h3>
              <p>插件只在 Ozon 页面读取分类和商品卡片，并与项目的选品页传递本地队列；不读取密码、Cookie 或其他网站页面，也不会把选品数据发送到 Neon。</p>
            </div>
          </section>

          <section id="limits">
            <h2>七、当前版本范围</h2>
            <ul>
              <li>当前版本支持商品详情页自动采集，以及列表页已加载商品的自动采集；商品详情页也保留单条手动采集。</li>
              <li>列表只读取当前页面已加载的商品；滚动后继续读取，不会自动翻页或后台持续请求。</li>
              <li>暂不包含 1688 图片找同款和供应商关联。</li>
              <li>暂不读取卖家后台的自有商品、订单或店铺数据。</li>
              <li>暂不提供账号之间的云端同步。</li>
            </ul>
            <p className={styles.footerNote}>如果浏览器扩展升级，建议重新下载站内最新 ZIP，并按照本文步骤重新加载插件。</p>
          </section>
        </article>
      </div>
    </main>
  );
}
