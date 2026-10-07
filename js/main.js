



//要获取游戏版本号请查阅游戏内存/金手指资料，历史版本号记录如下：
//  version_code: 11D95B00 (12.0.1) | 12400610 (13.0.1) | 123693D0 (14.0.1)
//                129E11D8 (15.0.1) | 12A4FD80 (16.0.0) | 12A4A1E8 (16.0.1)
//                129A7D80 (16.0.1 美版)
//  BID: 44C9289FBB51455F (16.0.0) | 92DF51D37268A38C (16.0.1) | D2FD97779381FB9A (16.0.2)

var TID = "0100559011740000";

var versionMap = {
    "16.0.2-港日": { "v": "16.0.2-港日", "BID": "D2FD97779381FB9A", "code": "12B157C0" },
    "16.0.1-港日": { "v": "16.0.1-港日", "BID": "92DF51D37268A38C", "code": "12A4A1E8" },
    "16.0.1-美版": { "v": "16.0.1-美版", "BID": "92DF51D37268A38C", "code": "129A7D80" },
    "16.0.0": { "v": "16.0.0", "BID": "44C9289FBB51455F", "code": "12A4FD80" },
}

var currentVersion = versionMap["16.0.2-港日"];

//当前程序(PWA)版本号，与 sw.js 的 CACHE 版本保持一致
var APP_VERSION = "v6.2.1";

var RefreshCount = 0;

let isExtremeMode = false;

var isStopRender = false;

var cost_skill_hex = {};
var DecoratrionNameMap = {};
var DecoratrionHexLvMap = {};

var PartIdxMap = {
    "1": "head",
    "2": "body",
    "3": "hand",
    "4": "waist",
    "5": "foot",
}

//位置编号对应的中文部位名（用于界面显示）
var PartIdxNameCN = {
    "1": "头部",
    "2": "胸部",
    "3": "手部",
    "4": "腰部",
    "5": "腿部",
}


var PartMapObj = {};
var PartMapAry = [];//name 用来排序
//当前数据
var CurData = {
    "name": "",
    "partMap": {},
    "charmData": createCharmData(),
    "weaponData": createWeaponData(),
};
var PartMap = {};
var CharmData = {
    sel1: [],
    sel2: [],
    skill1Hex: "00",
    skill1Lv: 0,
    skill1Type: "",
    skill2Hex: "00",
    skill2Lv: 0,
    skill2Type: "",
    slot: "000",
    decoration: [
        { "hex": "00", "lv": 0 },
        { "hex": "00", "lv": 0 },
        { "hex": "00", "lv": 0 },
    ]
};


var AutoGen = true;
var CharmSkillMax = false;
var ZipSameItem = false;
var DraftName = "临时配装";//纯内存草稿的显示名（界面展示用）
var DraftKey = "\u200b__DRAFT__\u200b";//草稿的内部 key：含零宽字符，用户不可能输入/保存出这个名字，用于与缓存库隔离
var draftToEndOnce = false;//一次性标志：点草稿×清空后，让本次渲染把草稿排到最后
//把内部 key 转成界面显示名（草稿显示为"临时配装"，其余原样返回）
function displayName(name) {
    return (name === DraftKey) ? DraftName : name;
}
var CacheObj = null;
var CList = [];
var MsgCount = 0;
var MsgAry = [];
var MsgLooping = false;
//记录当前屏幕上存活的 toast，用于堆叠定位（避免重叠）
var MsgStack = [];
//暂存"待确认覆盖保存"的配装名（重名确认流程用）
var PendingSaveName = "";
//暂存 PWA 安装事件（beforeinstallprompt）
var DeferredInstallPrompt = null;
//在页面最早期捕获安装事件（必须早于 bindEvents，避免错过）
window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    DeferredInstallPrompt = e;
    //有安装机会时，显示引导条（用户手动关闭过则不再打扰）
    try {
        if (localStorage.getItem("MHRSB_install_dismissed") === "1") return;
    } catch (err) { }
    let el = document.getElementById("installHint");
    if (el) el.classList.remove("d-none");
});
window.addEventListener("appinstalled", function () {
    DeferredInstallPrompt = null;
    let el = document.getElementById("installHint");
    if (el) el.classList.add("d-none");
});

init();
async function init() {

    stopRender();
    for (let i in PartIdxMap) {
        CurData.partMap[i] = null;
    }
    //初始化时重置"对比列表"，只保留"临时配装"（纯内存草稿）一项
    PartMapAry = [DraftKey];
    //清掉旧的草稿数据，避免"临时配装"残留上一次编辑内容
    delete PartMapObj[DraftKey];
    //初始化后编辑的就是"临时配装"（草稿），"当前"标题应同步显示
    CurData.name = DraftKey;
    $("#cache-name").val("");
    $("#curTitle").text(DraftName);
    for (let i in skill_data) {
        let ski = skill_data[i];
        let cost = ski["cost"];
        if (!cost_skill_hex["" + cost]) {
            cost_skill_hex["" + cost] = [];
        }
        cost_skill_hex["" + cost].push(ski);
    }
    for (let i in cost_skill_hex) {
        cost_skill_hex[i].sort(function (a, b) {
            return parseInt(a.hex, 16) - parseInt(b.hex, 16);
        })

    }
    initSkillInfo();
    //重置护石数据（含孔位 slot，避免 initialize 后残留上一次的孔位选择）
    CurData.charmData = createCharmData();
    //重置武器数据（避免残留上一次的武器珠子）
    CurData.weaponData = createWeaponData();
    initCharmSkillData();
    initDecorationData();
    initHtml();
    initTable();
    //初始化护石孔位下拉（选项与技能无关，保证页面加载即可选）
    initCharmSlotSel();
    //初始化所有位置的珠子框（无装备/无孔位时禁用，避免残留可编辑状态）
    for (let pi in PartIdxMap) {
        initDecorationSel(pi);
    }
    initDecorationSel("6");
    initDecorationSel("7");
    //复位 5 个装备位置的全部 UI（装备/词条/技能/珠子），确保占位值统一规范
    for (let pi in PartIdxMap) {
        resetPartUI(pi);
    }

    initCharmSel();
    bindEvents();
    //显示当前程序版本
    $("#app_version").text(APP_VERSION);
    //点击"版本号"检查更新（替代原来的"检查更新"按钮）
    $("#app_version").off("click").on("click", function () {
        checkForUpdate();
    }).off("keydown").on("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            checkForUpdate();
        }
    });
    $("#reInit").off("click").on("click", function () {
        initConfirm();
    });

    //未保存修改检测：用户在编辑器里做过任何输入/选择/点击改动 => 标记为脏
    //保存成功、加载配装、初始化、导入后会清除该标记
    window.__mhrsbDirty = false;
    function markDirty() { window.__mhrsbDirty = true; }
    window.__mhrsbMarkDirty = markDirty;
    //捕获所有输入框/下拉/多选的变更
    $(document).on("input.mhrsbDirty change.mhrsbDirty", "#main input, #main textarea, #main select", function () {
        markDirty();
    });
    //捕获编辑器内的点击型改动（选装备/选词条/选护石技能/切模式等）
    $(document).on("click.mhrsbDirty", "#main .armor_select_display, #main .decoration_input, #main .k_skill_display, #main .k_skill_change_display, #main .charm_skill_display, #switchMode", function () {
        markDirty();
    });

    //---- 主题切换（跟随系统 / 强制白天 / 强制暗色）----
    // 存 localStorage: "auto"（默认，跟随系统） | "light"（强制白天） | "dark"（强制暗色）
    var THEME_ORDER = ["auto", "light", "dark"];
    // emoji 与文字分开写：手机端只显示 emoji（省空间），桌面端显示完整文字
    var THEME_META = {
        auto: { icon: "🌓", text: "跟随系统", title: "主题：跟随系统" },
        light: { icon: "☀️", text: "白天", title: "主题：白天" },
        dark: { icon: "🌙", text: "暗色", title: "主题：暗色" }
    };
    function getTheme() {
        try { return localStorage.getItem("MHRSB_theme") || "auto"; } catch (e) { return "auto"; }
    }
    function applyTheme(mode) {
        if (THEME_ORDER.indexOf(mode) < 0) mode = "auto";
        let html = document.documentElement;
        let darkCss = document.getElementById("darkForceCss");
        html.setAttribute("data-theme", mode);
        // 强制暗色时启用 dark-force.css（系统亮色下也能变暗）；否则禁用
        if (darkCss) darkCss.setAttribute("media", (mode === "dark") ? "all" : "not all");
        let btn = document.getElementById("themeToggle");
        if (btn && THEME_META[mode]) {
            btn.innerHTML = '<span class="theme-icon">' + THEME_META[mode].icon + '</span>' +
                '<span class="theme-text">' + THEME_META[mode].text + '</span>';
            btn.setAttribute("title", THEME_META[mode].title);
        }
    }
    function setTheme(mode) {
        try { localStorage.setItem("MHRSB_theme", mode); } catch (e) { }
        applyTheme(mode);
    }
    applyTheme(getTheme());
    $("#themeToggle").off("click").on("click", function () {
        // 循环：跟随系统 → 白天 → 暗色 → 跟随系统
        let cur = getTheme();
        let next = THEME_ORDER[(THEME_ORDER.indexOf(cur) + 1) % THEME_ORDER.length];
        setTheme(next);
    });

    $("#version").change();
    $("#menu2").hide();
    startRender();
    showMsg("初始化完成");
    await initCache();
    //加载完成后清除"未保存"标记
    window.__mhrsbDirty = false;
    // await timeLag(500);
    //未保存修改时，关闭/刷新页面给出原生提示，防误丢编辑
    window.addEventListener("beforeunload", function (e) {
        if (!window.__mhrsbDirty) return;
        e.preventDefault();
        //部分浏览器需要设置 returnValue 才会弹出提示
        e.returnValue = "";
        return "";
    });
    $("#main").show();



}

//检查更新：通过Service Worker检查是否有新版本
async function checkForUpdate() {
    showMsg("正在检查更新...");
    try {
        if ('serviceWorker' in navigator) {
            let reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                //主动检查 SW 是否有更新
                if (reg.update) {
                    try { await reg.update(); } catch (e) { /* ignore */ }
                }

                //对比远程 sw.js 的版本号
                let remoteVer = await fetchRemoteVersion();
                let hasNewSW = !!reg.waiting;
                let verMismatch = remoteVer && remoteVer !== APP_VERSION;

                if (hasNewSW || verMismatch) {
                    //提示用户，由用户决定何时更新（避免打断正在进行的编辑）
                    promptUpdate(remoteVer, reg);
                    return;
                }
            }
        }
        //兜底：直接对比远程版本
        let remoteVer2 = await fetchRemoteVersion();
        if (remoteVer2 && remoteVer2 !== APP_VERSION) {
            promptUpdate(remoteVer2, null);
        } else {
            showMsg("当前已是最新版本 " + APP_VERSION);
        }
    } catch (err) {
        console.error("检查更新失败:", err);
        showMsg("检查更新失败，请检查网络");
    }
}

//提示有新版本，由用户点击后更新
function promptUpdate(remoteVer, reg) {
    showPromptModal({
        title: "发现新版本",
        text: "检测到新版本" + (remoteVer ? " <strong>" + escapeHtml(remoteVer) + "</strong>" : "") + "。<br><span class='text-secondary small'>更新会刷新页面，未保存的编辑将丢失。</span>",
        okText: "立即更新",
        onOk: function () {
            setTimeout(async function () {
                try {
                    if (reg && reg.waiting) {
                        //让等待中的新 SW 立即接管，接管后会触发 controllerchange → 自动刷新
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                    } else {
                        //没有 waiting，则清掉当前 SW 缓存后刷新，确保拿到新代码
                        await clearThisAppCache();
                        location.reload();
                    }
                } catch (e) {
                    location.reload();
                }
            }, 300);
        }
    });
}

//清空本应用相关的 SW 缓存（避免 reload 时命中旧缓存中的 index.html/js）
async function clearThisAppCache() {
    try {
        if ('caches' in window) {
            let keys = await caches.keys();
            await Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }
    } catch (e) {
        // ignore
    }
}

//读取远程sw.js里的CACHE版本号
async function fetchRemoteVersion() {
    try {
        //加时间戳，避免命中 HTTP 缓存
        let res = await fetch('./sw.js?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return null;
        let txt = await res.text();
        let m = txt.match(/CACHE\s*=\s*['"]([^'"]+)['"]/);
        if (m && m[1]) {
            //CACHE形如 app-v6.1.4 -> 取 v6.1.4
            let mm = m[1].match(/v[\d.]+/);
            return mm ? mm[0] : m[1];
        }
    } catch (e) {
        // ignore
    }
    return null;
}

async function initCache() {
    //根据版本获取？
    showMsg("加载缓存");
    $("#saveCache-spinner").hide();
    //使用项目专属数据库名，避免与同域下其它 PWA 的数据互相污染
    let cc = new Cache("MHRSB_Cheater_db", "sys", 1);
    await cc.init();
    CacheObj = cc;
    let last = await loadList();


    //默认显示最后一个设置    
    //await loadCache(last);

}
//加载历史缓存列表（支持关键词过滤：仅影响显示，CList 始终是全部）
async function loadList() {
    let cl = await CacheObj.readAll();
    CList = [];
    //先构建 name -> item 映射（CList / PartMapObj 必须是完整的，重名检测等依赖它）
    for (let i = 0; i < cl.length; i++) {
        let n = cl[i]["k"];
        cl[i]["v"]["name"] = n;
        CList.push(n);
        let tmp = cl[i]["v"];
        if (!tmp["name"]) tmp["name"] = n;
        PartMapObj[n] = tmp;
    }

    //顺序完全由"手动排序（localStorage 里的 order）"决定：
    //  order 里有的按其顺序排在前；不在 order 里的（新配装）按保存时间从新到旧放在最前面
    let order = getCustomOrder();
    let map = {};
    for (let i = 0; i < cl.length; i++) map[cl[i]["k"]] = cl[i];

    let ordered = [];
    let used = {};
    order.forEach(function (n) {
        if (map[n]) { ordered.push(map[n]); used[n] = true; }
    });
    //新配装（不在 order 里）：按时间从新到旧，放在最前面
    let fresh = cl.filter(function (it) { return !used[it["k"]]; });
    fresh.sort(function (a, b) { return new Date(b.v.t).getTime() - new Date(a.v.t).getTime(); });
    cl = fresh.concat(ordered);

    //方向：asc = 正序（整体反转），desc = 逆序（默认，原样）
    let isAsc = (getSortDir() === "asc");
    if (isAsc) cl = cl.slice().reverse();

    //关键词过滤（只影响渲染）
    let kw = "";
    try {
        let el = document.getElementById("cacheSearchInput");
        if (el) kw = (el.value || "").trim().toLowerCase();
    } catch (e) { }
    let shown = cl;
    if (kw) {
        shown = cl.filter(function (item) {
            return String(item["k"]).toLowerCase().indexOf(kw) >= 0;
        });
    }

    let str = "";
    let cl0 = ((cl && cl[0]) ? cl[0]["k"] : DraftKey);
    //注意：不再把缓存项自动加入"对比列表"，对比由用户主动"添加对比"触发
    let isFiltering = !!kw;
    for (let i = 0; i < shown.length; i++) {
        let n = shown[i]["k"];
        let t = shown[i]["v"]["t"];
        t = format(t);
        //过滤状态下隐藏"上移/下移"（过滤后"相邻"含义会乱）
        let upBtn = "", downBtn = "";
        if (!isFiltering) {
            upBtn = (i > 0)
                ? `<button type="button" class="moveCacheUp btn btn-outline-secondary btn-sm" data-name="${n}" title="上移">↑</button>`
                : "";
            downBtn = (i < shown.length - 1)
                ? `<button type="button" class="moveCacheDown btn btn-outline-secondary btn-sm" data-name="${n}" title="下移">↓</button>`
                : "";
        }
        //序号：按当前显示顺序，从 1 开始
        let no = i + 1;
        str = str + `<li class="list-group-item history-item">
        <span class="cache-index text-secondary small" title="第 ${no} 个">#${no}</span>
        <button type="button" class="cacheItem btn btn-link p-0 text-start flex-grow-1" data-name="${n}" title="${escapeHtml(n)}-${t}">${escapeHtml(n)}<br><small class="text-secondary">${t}</small></button>
        ${upBtn}${downBtn}
        <button type="button" class="shareCache btn btn-outline-success btn-sm" data-name="${n}">分享</button>
        <button type="button" class="renameCache btn btn-outline-secondary btn-sm" data-name="${n}">重命名</button>
        <button type="button" class="deleteCache btn btn-outline-danger btn-sm" data-name="${n}">删除</button>
        </li>`;
    }
    //空状态：区分"没有配装"和"搜索无结果"
    if (shown.length === 0) {
        if (cl.length === 0) {
            str = `<li class="list-group-item history-empty text-center text-secondary py-4">
                <div class="mb-1">暂无配装</div>
                <small>点击下方「保存」即可把当前配装保存到这里</small>
            </li>`;
        } else {
            str = `<li class="list-group-item history-empty text-center text-secondary py-4">
                <div class="mb-1">没有匹配「${escapeHtml(kw)}」的配装</div>
                <small>共 ${cl.length} 个配装</small>
            </li>`;
        }
    }
    $(".dropdown-menu-cache").html(str);
    //清除按钮的显示与输入框非空联动
    try {
        let cbtn = document.getElementById("cacheSearchClear");
        if (cbtn) cbtn.style.display = kw ? "" : "none";
    } catch (e) { }
    //配装总数 + 排序按钮文案
    try {
        let lbl = document.getElementById("cacheCountLabel");
        if (lbl) lbl.textContent = cl.length ? ("共 " + cl.length + " 个配装" + (kw ? "，" + shown.length + " 个匹配" : "")) : "";
        updateSortToggleText();
    } catch (e) { }
    loadCompareList();
    return cl0;
}

//读取排序方向（desc=逆序，默认；asc=正序）
function getSortDir() {
    try {
        let d = localStorage.getItem("MHRSB_cache_sortdir");
        return (d === "asc") ? "asc" : "desc";
    } catch (e) {
        return "desc";
    }
}
function setSortDir(d) {
    try { localStorage.setItem("MHRSB_cache_sortdir", d === "asc" ? "asc" : "desc"); } catch (e) { }
}
//更新正/逆序按钮文案
function updateSortToggleText() {
    let btn = document.getElementById("cacheSortToggle");
    if (!btn) return;
    if (getSortDir() === "asc") {
        btn.textContent = "↑ 正序";
    } else {
        btn.textContent = "↓ 逆序";
    }
}

//读取用户自定义配装顺序（localStorage）
function getCustomOrder() {
    try {
        let s = localStorage.getItem("MHRSB_cache_order");
        let a = s ? JSON.parse(s) : [];
        return Array.isArray(a) ? a : [];
    } catch (e) {
        return [];
    }
}
//保存用户自定义配装顺序
function setCustomOrder(arr) {
    try {
        localStorage.setItem("MHRSB_cache_order", JSON.stringify(arr || []));
    } catch (e) {
        // ignore
    }
}
//上移 / 下移"我的配装"中的某一项（正序/逆序都能用）
function moveCacheItem(name, dir) {
    //以当前列表渲染顺序为准（读 DOM 里的 data-name）
    let names = [];
    $(".dropdown-menu-cache .history-item .cacheItem").each(function () {
        names.push($(this).attr("data-name"));
    });
    //若当前是"正序"，DOM 顺序是 order 的翻转 → 先翻回 order 视角，避免越调越乱
    let isAsc = (getSortDir() === "asc");
    if (isAsc) names.reverse();

    let idx = names.indexOf(name);
    if (idx < 0) return;
    //注意：正序下"屏幕上点的↑"= order 视角里的"↓"，所以方向要取反
    let realDir = isAsc ? (dir === "up" ? "down" : "up") : dir;
    let swap = (realDir === "up") ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= names.length) return;
    //交换
    let tmp = names[idx];
    names[idx] = names[swap];
    names[swap] = tmp;
    setCustomOrder(names);
    loadList();
}
function loadCompareList() {

    let str2 = "";
    for (let i = 0; i < CList.length; i++) {

        let n = CList[i];
        //已经在对比列表的 不加入
        if (PartMapAry.includes(n)) continue;
        str2 = str2 + `<li class="dropdown-item d-flex align-items-center justify-content-between gap-2 compare-row">
        <span class="compareItem text-truncate" data-name="${n}" title="${displayName(n)}">${displayName(n)}</span>
        <button type="button" class="addToCompare btn btn-add-compare btn-sm" data-name="${n}">添加</button>
        </li>`;
    }
    $(".dropdown-menu-compare").html(str2);
}
//判断一个配装数据是否"有实际技能"（含装备技能/珠子/护石技能），用于决定"当前配装"占位是否保留
function hasAnySkillData(ptr) {
    if (!ptr) return false;
    //装备技能（怪异化后 eq_k_skill）
    if (ptr.partMap) {
        for (let p in ptr.partMap) {
            let d = ptr.partMap[p];
            if (!d) continue;
            let skm = d["eq_k_skill"] || d["eq_skill"] || {};
            for (let hex in skm) {
                if (skm[hex] && skm[hex]["lv"] > 0) return true;
            }
            //珠子
            let deco = d["decoration"] || [];
            for (let i = 0; i < deco.length; i++) {
                if (deco[i] && deco[i]["lv"] > 0) return true;
            }
        }
    }
    //护石技能
    if (ptr.charmData) {
        if (ptr.charmData["skill1Lv"] > 0 || ptr.charmData["skill2Lv"] > 0) return true;
        let cdeco = ptr.charmData["decoration"] || [];
        for (let i = 0; i < cdeco.length; i++) {
            if (cdeco[i] && cdeco[i]["lv"] > 0) return true;
        }
    }
    //武器珠子
    if (ptr.weaponData) {
        let wdeco = ptr.weaponData["decoration"] || [];
        for (let i = 0; i < wdeco.length; i++) {
            if (wdeco[i] && wdeco[i]["lv"] > 0) return true;
        }
    }
    return false;
}

//把某个防具位置的 UI 彻底复位（装备/词条/技能/珠子全部清空），
//用于加载配装前清空旧数据，避免"本次数据为空的位置"残留上一次的词条/珠子/技能
function resetPartUI(idx) {
    //装备下拉 + 显示框
    $(".armor_select_" + idx).val("-----");
    $(".armor_select_display_" + idx).val("");
    //装备技能列表（装备选中后才渲染，清空时也要清掉，否则会残留上一次的装备技能）
    $(".armor_skill_" + idx).html("");
    //防御/孔位/点数等显示
    $(".armor_slot_" + idx).html("");
    $(".armor_cost_" + idx).html("");
    $(".armor_pos_" + idx).html("");
    //词条 + 技能列（每行）
    let tr = $(".k_skill_tbody_" + idx).find("tr");
    for (let i = 0; i < tr.length; i++) {
        let $tr = $(tr[i]);
        let ksel = $tr.find(".k_skill_select");
        if (ksel.length) {
            //词条下拉只留占位项，值为 idx_i_00_0
            ksel.html(`<option value="${idx}_${i}_00_0">-----</option>`);
            ksel.val(`${idx}_${i}_00_0`);
        }
        $tr.find(".k_skill_display").val("");
        let csel = $tr.find(".k_skill_change");
        if (csel.length) {
            //与 initKSkillSelect 保持一致的规范占位值：{idx}_{行号}_00_0
            let phVal = `${idx}_${i}_00_0`;
            csel.html(`<option value="${phVal}">-----</option>`);
            csel.val(phVal);
        }
        $tr.find(".k_skill_change_display").val("");
    }
    //珠子输入框（3 个）
    for (let i = 0; i < 3; i++) {
        let $d = $(".decoration_input_" + idx + "_" + i);
        if ($d.length) {
            $d.val("");
            $d.attr("data-slot", "0");
            if (idx != "7") $d.attr("disabled", "disabled");
            $d.attr("placeholder", "");
        }
    }
}

//把一份配装数据（{partMap,charmData,weaponData}）贴进编辑器。
//name 为写入 CurData 的名字；isDraft 为 true 表示"纯内存草稿"（不写缓存相关输入框）
function applyDataToEditor(ptr, name, isDraft) {
    //用于以前的编号问题
    let cmm = {
        "9999991": "498",
        "9999992": "499",
        "9999993": "500",
        "9999994": "506",
        "9999995": "502",
    }
    let tmp = ptr.PartMap || ptr.partMap || {};
    let tmpC = ptr.CharmData || ptr.charmData;
    let tmpW = ptr.WeaponData || ptr.weaponData;
    //先清空全部 5 个防具位置，避免"本次数据里为空的位置"残留上一次加载的装备/词条/技能/珠子
    //（例如配装A没设头、配装B设了头，先读B再读A时，头会错误地继承B）
    for (let idx in PartIdxMap) {
        CurData.partMap[idx] = null;
        resetPartUI(idx);
    }
    for (let idx in tmp) {
        let pd = tmp[idx];
        //装备未选择时该位置可能为 null，跳过避免报错
        if (!pd) continue;
        if (pd["eq_id"]) {
            let aa = pd["eq_id"].split("_");
            if (cmm[aa[0]]) {
                pd["eq_id"] = cmm[aa[0]] + "_" + aa[1];
            }

            $(".armor_select_" + idx).val(pd["eq_id"]);
            $(".armor_select_" + idx).change();
            //同步只读显示框（装备名）
            let optDisp = $(".armor_select_" + idx).find("option[value='" + pd["eq_id"] + "']");
            $(".armor_select_display_" + idx).val(optDisp.length ? optDisp.text() : "");
            //保留珠子数据副本(change会触发initDecorationSel把数据清空)
            let pDeco = JSON.parse(JSON.stringify(pd["decoration"] || []));
            let sd = pd["k_skill"] || [];
            for (let i = 0; i < sd.length; i++) {
                let d = sd[i];

                let v1 = `${idx}_${i}_${d["k_skill_hex"]}_${d["k_skill_cost"]}`;
                $(".armor_container_" + idx).find(".k_skill_select").eq(i).val(v1);
                $(".armor_container_" + idx).find(".k_skill_select").eq(i).change();

                if (d["k_skill_edit_hex"] == "00") {
                    continue;
                }
                let v2 = `${idx}_${i}_${d["k_skill_edit_hex"]}`;
                $(".armor_container_" + idx).find(".k_skill_change").eq(i).val(v2);
                $(".armor_container_" + idx).find(".k_skill_change").eq(i).change();
            }
            for (let i = 0; i < pDeco.length; i++) {
                let d = pDeco[i];

                if ((d["hex"] != "00") && (d["lv"] > 0)) {
                    let v3 = `${d["hex"]}_${d["lv"]}`;
                    $(`.decoration_input_${idx}_${i}`).val(v3);
                    $(`.decoration_input_${idx}_${i}`).trigger("change");
                }
            }
        }

    }
    CurData.partMap = tmp;
    //charm
    if (tmpC) {
        if (!tmpC["decoration"]) tmpC["decoration"] = [];
        //缓存里不含技能池(sel1/sel2)，需要从当前数据补充，否则重建下拉列表会报错
        if (!tmpC["sel1"]) tmpC["sel1"] = CurData.charmData["sel1"] || [];
        if (!tmpC["sel2"]) tmpC["sel2"] = CurData.charmData["sel2"] || [];
        //保留珠子数据副本(下面设置孔位会触发initDecorationSel把数据清空)
        let charmDeco = JSON.parse(JSON.stringify(tmpC["decoration"]));
        //先写入数据，再按当前模式重建护石下拉并按hex选中（让等级按当前模式规范化）
        CurData.charmData = tmpC;
        initCharmSel2();
        //按技能hex选中护石技能下拉项(缓存里存的等级可能与当前模式列表不一致，如极限缓存15级)
        //用"恢复中"标志包住，避免 onSelectCharmSkill 把等级顶成 option 上限
        CharmRestoreLv1 = tmpC["skill1Lv"];
        CharmRestoreLv2 = tmpC["skill2Lv"];
        isCharmRestoring = true;
        selectCharmSkillOption("#charm_skill_select1", "1", tmpC["skill1Hex"]);
        selectCharmSkillOption("#charm_skill_select2", "2", tmpC["skill2Hex"]);
        isCharmRestoring = false;
        //还原护石技能的"具体等级"（select 选中会按 option 上限设等级，这里用缓存里的真实等级覆盖）
        if (tmpC["skill1Hex"] && tmpC["skill1Hex"] != "00") {
            let lv1 = parseInt(tmpC["skill1Lv"], 10) || 0;
            if (lv1 > 0) {
                CurData.charmData["skill1Lv"] = lv1;
                $("#charm_skill_select1").find("option:selected").text(
                    (skill_data[tmpC["skill1Hex"]] ? skill_data[tmpC["skill1Hex"]]["sname"] : "") + " " + lv1);
            }
        }
        if (tmpC["skill2Hex"] && tmpC["skill2Hex"] != "00") {
            let lv2 = parseInt(tmpC["skill2Lv"], 10) || 0;
            if (lv2 > 0) {
                CurData.charmData["skill2Lv"] = lv2;
                $("#charm_skill_select2").find("option:selected").text(
                    (skill_data[tmpC["skill2Hex"]] ? skill_data[tmpC["skill2Hex"]]["sname"] : "") + " " + lv2);
            }
        }
        let v3 = tmpC["slot"];
        //先重建孔位下拉（否则下拉里可能没有 v3 这个选项，导致选不中）
        initCharmSlotSel();
        $("#charm_slot_select").val(v3);
        $("#charm_slot_select").change();
        //最后恢复珠子(用副本，避免被initDecorationSel清空影响)
        for (let i = 0; i < charmDeco.length; i++) {
            let d = charmDeco[i];
            if ((d["hex"] != "00") && (d["lv"] > 0)) {
                let v4 = `${d["hex"]}_${d["lv"]}`;
                $(`.decoration_input_${6}_${i}`).val(v4);
                $(`.decoration_input_${6}_${i}`).trigger("change");
            }
        }
    }
    if (tmpW) {
        let wdlist = tmpW["decoration"] || [];
        for (let i = 0; i < wdlist.length; i++) {
            let d = wdlist[i];
            if ((d["hex"] != "00") && (d["lv"] > 0)) {
                let v4 = `${d["hex"]}_${d["lv"]}`;
                $(`.decoration_input_${7}_${i}`).val(v4);
                $(`.decoration_input_${7}_${i}`).trigger("change");
            }
        }
        CurData.weaponData = tmpW;
    }
    CurData.name = name;
    //草稿不写入缓存名输入框（它没有对应的缓存记录）
    if (!isDraft) $("#cache-name").val(name);
    if (isDraft) $("#cache-name").val("");
    $("#curTitle").text(displayName(name));
}

//切回"临时配装"（纯内存草稿）：直接从内存取数据贴回编辑器，不查缓存
function switchToDraft() {
    let draft = PartMapObj[DraftKey];
    if (!draft) {
        showMsg("没有可切换的临时配装");
        return;
    }
    //切换前，先把当前编辑的一套快照存好（若它也在对比列表里且不是草稿本身）
    let curName = CurData.name;
    if (curName && curName !== DraftKey && PartMapAry.includes(curName)) {
        PartMapObj[curName] = JSON.parse(JSON.stringify(CurData));
    }
    //用草稿的副本贴回编辑器（避免之后 CurData 被改写污染内存里的草稿）
    let snap = JSON.parse(JSON.stringify(draft));
    applyDataToEditor(snap, DraftKey, true);
    //草稿放到对比最前，保证它就是"当前编辑项"
    PartMapAry = PartMapAry.filter(function (n) { return n !== DraftKey; });
    PartMapAry.unshift(DraftKey);
    refreshShowArmorData();
    showMsg("已切回:临时配装");
    window.__mhrsbDirty = false;
}

//清空"临时配装"（纯内存草稿）
//注意：只清空草稿数据；只有当"当前正在编辑的就是草稿"时，才同时复位编辑器（否则会误清当前加载的配装）
function clearDraft() {
    //判断当前是不是正在编辑草稿
    let editingDraft = (CurData.name === DraftKey || !CurData.name);

    if (editingDraft) {
        //把 5 个防具位置复位为空
        resetPartUI("1");
        resetPartUI("2");
        resetPartUI("3");
        resetPartUI("4");
        resetPartUI("5");
        for (let i in PartIdxMap) {
            CurData.partMap[i] = null;
        }
        //复位护石（位置6）：技能下拉、孔位、护石珠子
        CurData.charmData = createCharmData();
        //重建护石技能池（sel1/sel2），否则护石技能1/2 下拉会没有可选项
        initCharmSkillData();
        initCharmSel2();
        //同步护石技能只读显示框（清空）
        syncCharmDisplay("1");
        syncCharmDisplay("2");
        //重建护石孔位下拉（否则孔位选不了）
        initCharmSlotSel();
        $("#charm_slot_select").val("000");
        $("#charm_slot_select").trigger("change");
        for (let i = 0; i < 3; i++) {
            let $d = $(".decoration_input_6_" + i);
            if ($d.length) {
                $d.val("");
                $d.attr("data-slot", "0");
                $d.attr("disabled", "disabled");
                $d.attr("placeholder", "");
            }
        }
        //复位武器（位置7）珠子
        CurData.weaponData = createWeaponData();
        for (let i = 0; i < 3; i++) {
            let $d = $(".decoration_input_7_" + i);
            if ($d.length) {
                $d.val("");
                $d.attr("data-slot", "4");
                $d.attr("placeholder", "【4】");
            }
        }
        initDecorationSel("7");
        CurData.name = DraftKey;
        $("#cache-name").val("");
        $("#curTitle").text(DraftName);
    }

    //只清掉草稿数据（不影响其他配装）
    PartMapObj[DraftKey] = { name: DraftKey, partMap: {}, charmData: createCharmData(), weaponData: createWeaponData() };

    //点 × 清空后：如果草稿不是第一个，就把它移到最后；如果它本来就是第一个，保持原位
    if (PartMapAry[0] !== DraftKey) {
        draftToEndOnce = true;
        PartMapAry = PartMapAry.filter(function (n) { return n !== DraftKey; });
        PartMapAry.push(DraftKey);
    }
    refreshShowArmorData();
    showMsg("已清空临时配装");
}

async function loadCache(name) {
    let cahe = await execLoad(name);
    if (cahe) {
        showMsg("加载中:" + name);
        try {

            //加载前：把"当前正在编辑的配装"深拷贝存入 PartMapObj，避免 CurData 被后续覆盖，
            //导致对比列表里同名的旧项一起被改写（技能等级等数据丢失）
            if (CurData.name && CurData.name !== name && PartMapAry.includes(CurData.name)) {
                PartMapObj[CurData.name] = JSON.parse(JSON.stringify(CurData));
            }

            //根据缓存里保存的模式，自动切换极限/普通模式（旧缓存没有此字段，保持当前模式）
            if (cahe.extreme !== undefined) {
                setExtremeMode(!!cahe.extreme);
            }

            //把数据贴进编辑器（不写缓存名输入框由 applyDataToEditor 内部按 isDraft=false 处理）
            applyDataToEditor(cahe, name, false);

            //从"我的配装"加载：
            //  - 保留已有对比项
            //  - "临时配装"（纯内存草稿）永远保留（不移除）
            //  - 移除同名项后，把加载项放到最前
            PartMapAry = PartMapAry.filter(function (n) {
                if (n === name) return false;
                return true;
            });
            PartMapAry.unshift(name);
            refreshShowArmorData();
            showMsg("加载完成:" + name);
            window.__mhrsbDirty = false;
        } catch (err) {
            console.error("加载缓存失败:", err);
            showMsg("加载缓存失败-" + (err && err.message ? err.message : JSON.stringify(err)));
            if (confirm(`加载缓存失败 是否删除【${name}】？`)) {
                doDelCache(name);
            }
        }
    } else {
        //没有找到对应的缓存
        // showMsg("加载失败:" + name);
    }

}
//判断当前是否有"未保存"的编辑内容（用于初始化前提醒）
function hasUnsavedEdit() {
    // 只要任一部位选了装备 / 护石技能非空 / 武器珠子被改过，就认为有内容
    for (let i in PartIdxMap) {
        if (CurData.partMap[i]) return true;
    }
    try {
        if (CurData.charmData && (CurData.charmData.skill1Type || CurData.charmData.skill2Type)) return true;
    } catch (e) { }
    // 当前标题不是"临时配装"说明在编辑已保存的配装
    let t = $("#curTitle").text().trim();
    if (t && t !== DraftName) return true;
    return false;
}
//点击「初始化」：先弹确认框，防误触丢失编辑
function initConfirm() {
    let dirty = hasUnsavedEdit();
    $("#initConfirmWarn").toggleClass("d-none", !dirty);
    $("#initConfirmModal").modal("show");
}
//通用输入/确认弹窗
// opts: {title, text, withInput, inputValue, inputMaxlength, okText, warnText, onOk(value)}
// onOk 若返回 false，则弹窗不关闭（用于校验失败时保留）
//HTML 转义（用于把用户输入安全插入 HTML）
function escapeHtml(s) {
    let str = String(s == null ? "" : s);
    str = str.split("&").join("&amp;");
    str = str.split("<").join("&lt;");
    str = str.split(">").join("&gt;");
    str = str.split(String.fromCharCode(34)).join(String.fromCharCode(38) + "quot;");
    str = str.split("'").join("&#39;");
    return str;
}
var PromptModalCb = null;
function showPromptModal(opts) {
    opts = opts || {};
    $("#promptModalLabel").text(opts.title || "提示");
    $("#promptModalText").html(opts.text || "");
    $("#promptModalOk").text(opts.okText || "确定");
    $("#promptModalOk").removeClass("btn-warning btn-danger").addClass(opts.okClass || "btn-primary");
    // 警告文字
    if (opts.warnText) {
        $("#promptModalWarn").text(opts.warnText).removeClass("d-none");
    } else {
        $("#promptModalWarn").addClass("d-none");
    }
    // 输入框
    let $inp = $("#promptModalInput");
    if (opts.withInput) {
        $inp.removeClass("d-none").attr("maxlength", opts.inputMaxlength || 30).val(opts.inputValue || "");
    } else {
        $inp.addClass("d-none").val("");
    }
    // 取消按钮（技能效果等纯展示弹窗可隐藏）
    $("#promptModalCancel").toggleClass("d-none", !!opts.hideCancel);
    PromptModalCb = opts.onOk || null;
    //关键：打开前先关掉所有已打开的弹窗，避免嵌套导致"第一次点击关掉旧弹窗"
    closeAllModals();
    let pmEl = document.getElementById("promptModal");
    //"点外部关闭"由我们自己在 keydown / 遮罩点击里判断（不用 Bootstrap 的 backdrop 选项，
    //避免 dispose 旧实例后 backdrop 事件丢失导致报错）
    pmEl.__dismissOnBackdrop = !!opts.dismissOnBackdrop;
    if (!pmEl.__backdropBound) {
        pmEl.__backdropBound = true;
        //点遮罩（modal 元素本身）关闭
        pmEl.addEventListener("mousedown", function (e) {
            if (e.target === pmEl && pmEl.__dismissOnBackdrop) {
                bootstrap.Modal.getOrCreateInstance(pmEl).hide();
            }
        });
        //Esc 关闭（仅纯展示弹窗）
        pmEl.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && pmEl.__dismissOnBackdrop) {
                bootstrap.Modal.getOrCreateInstance(pmEl).hide();
            }
        });
    }
    bootstrap.Modal.getOrCreateInstance(pmEl).show();
    if (opts.withInput) {
        setTimeout(function () {
            let el = document.getElementById("promptModalInput");
            if (el && !isTouchDevice()) { el.focus(); el.select(); }
        }, 350);
    }
}
//安全关闭所有已打开的 Bootstrap 弹窗（避免叠加）
function closeAllModals() {
    if (!window.bootstrap) return;
    document.querySelectorAll(".modal.show").forEach(function (el) {
        try {
            bootstrap.Modal.getOrCreateInstance(el).hide();
        } catch (e) { }
    });
}
//绑定通用弹窗按钮（只绑一次）
function bindPromptModal() {
    $("#promptModalOk").off("click").on("click", function () {
        let val = $("#promptModalInput").val();
        if (PromptModalCb) {
            let ret = PromptModalCb(val);
            if (ret === false) return; // 校验失败，保持打开
        }
        PromptModalCb = null;
        bootstrap.Modal.getOrCreateInstance(document.getElementById("promptModal")).hide();
    });
    $("#promptModalCancel").off("click").on("click", function () {
        PromptModalCb = null;
    });
    //回车 = 确定
    $("#promptModalInput").off("keydown").on("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            $("#promptModalOk").trigger("click");
        }
    });
}

//保存当前设置缓存
async function saveCache() {
    $("#saveCache-spinner").show();
    let name = $("#cache-name").val().trim();
    if (!name) {
        $("#cache-name").focus();
        $("#saveCache-spinner").hide();
        showMsg("请填写备注名");
        return;
    }
    //重名检测：已存在同名配装时，弹"覆盖确认"（独立弹窗，会先关掉保存弹窗）
    if (CList && CList.indexOf(name) >= 0) {
        $("#saveCache-spinner").hide();
        showPromptModal({
            title: "配装已存在",
            text: "已存在名为 <strong>" + escapeHtml(name) + "</strong> 的配装。<br><span class='text-danger small'>继续将<strong>覆盖</strong>原配装内容！</span>",
            okText: "覆盖保存",
            okClass: "btn-warning",
            onOk: function () {
                //延迟一点再保存，等弹窗关闭动画完成
                setTimeout(function () { doSaveCache(name); }, 300);
            }
        });
        return;
    }
    await doSaveCache(name);
}
//真正执行保存（被 saveCache 或「覆盖保存」按钮调用）
async function doSaveCache(name) {
    $("#saveCache-spinner").show();
    CurData.name = name;
    await execSave(name, CurData.partMap, CurData.charmData, CurData.weaponData, null, isExtremeMode);
    $("#saveCache-spinner").hide();
    $("#cache-name").val(name);
    showMsg("保存成功:" + name);
    window.__mhrsbDirty = false;
    await loadList();
    $('#cacheModal').modal('hide');
}
const TmpCacheSharePrefix = "MHRSB1:";

function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function gzipCompress(text) {
    if (typeof CompressionStream === "undefined") throw new Error("当前 WebView 不支持压缩功能，请更新 Android System WebView");
    const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gzipDecompress(bytes) {
    if (typeof DecompressionStream === "undefined") throw new Error("当前 WebView 不支持解压功能，请更新 Android System WebView");
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return await new Response(stream).text();
}

//分享指定名称的缓存
async function shareCacheByName(name) {
    try {
        if (!name) throw new Error("没有指定要分享的配装");
        const cache = await CacheObj.get(name);
        if (!cache) throw new Error("没有找到缓存：" + name);
        const json = JSON.stringify({
            name: name,
            partMap: cache.partMap,
            charmData: cache.charmData,
            weaponData: cache.weaponData,
            extreme: cache.extreme
        });
        const code = TmpCacheSharePrefix + bytesToBase64(await gzipCompress(json));
        let ok = await copyText(code);
        if (ok) {
            showMsg("分享码已复制到剪贴板（长度 " + code.length + "）");
        } else {
            showMsg("复制失败，已弹出分享码供手动复制");
        }
        //额外弹窗显示分享码，方便手动复制/查看（复制失败时的兜底）
        showPromptModal({
            title: "分享码",
            text: "配装 <strong>" + escapeHtml(name) + "</strong> 的分享码（已尝试复制到剪贴板）：",
            withInput: true,
            inputValue: code,
            inputMaxlength: 100000,
            okText: "复制",
            onOk: async function (val) {
                let ok2 = await copyText(val || code);
                showMsg(ok2 ? "已复制分享码" : "复制失败，请长按输入框手动复制");
            }
        });
    } catch (err) {
        console.error(err);
        showMsg("分享失败:" + err.message);
    }
}

//复制文本到剪贴板（带旧浏览器回退）
async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (e) {
            // 继续尝试回退方案
        }
    }
    return fallbackCopy(text);
}

//重命名缓存（用通用弹窗，含重名校验）
function renameCache(oldName) {
    //找到原配装
    CacheObj.get(oldName).then(function (cache) {
        if (!cache) {
            showMsg("没有找到配装：" + oldName);
            return;
        }
        showPromptModal({
            title: "重命名配装",
            text: "将配装 <strong>" + escapeHtml(oldName) + "</strong> 重命名为：",
            withInput: true,
            inputValue: oldName,
            inputMaxlength: 30,
            okText: "重命名",
            onOk: function (val) {
                let newName = (val || "").trim();
                if (!newName) {
                    showMsg("名称不能为空");
                    return false; // 保持弹窗
                }
                if (newName === oldName) {
                    return true; // 没变，直接关闭
                }
                //重名校验：目标名已被占用 → 询问是否覆盖
                if (CList && CList.indexOf(newName) >= 0) {
                    //延迟一点，再弹"覆盖"确认（会先关掉当前弹窗）
                    setTimeout(function () {
                        showPromptModal({
                            title: "名称已存在",
                            text: "已存在名为 <strong>" + escapeHtml(newName) + "</strong> 的配装。<br><span class='text-danger small'>继续将<strong>覆盖</strong>那个配装，并把「" + escapeHtml(oldName) + "」删除！</span>",
                            okText: "覆盖并重命名",
                            okClass: "btn-warning",
                            onOk: function () {
                                setTimeout(function () {
                                    doRenameCache(oldName, newName, cache);
                                }, 300);
                            }
                        });
                    }, 300);
                    return true; // 关闭当前输入弹窗
                }
                //无冲突，直接改
                doRenameCache(oldName, newName, cache);
                return true;
            }
        });
    }).catch(function (err) {
        console.error(err);
        showMsg("重命名失败:" + (err && err.message ? err.message : err));
    });
}
//执行重命名（oldName → newName），overwrite 表示目标名可能已存在
async function doRenameCache(oldName, newName, cache) {
    try {
        //写入新名字（保留原模式）
        await execSave(newName, cache.partMap, cache.charmData, cache.weaponData, cache.t, cache.extreme);
        //删除旧名字（若新旧不同；避免误删刚写入的）
        if (oldName !== newName) {
            await CacheObj.delete(oldName);
        }
        //若当前加载的正是这一条，同步更新名称显示
        if (CurData.name === oldName) {
            CurData.name = newName;
            $("#curTitle").text(newName);
        }
        showMsg("已重命名为：" + newName);
        await loadList();
    } catch (err) {
        console.error(err);
        showMsg("重命名失败:" + (err && err.message ? err.message : err));
    }
}

//从分享码文本导入（供剪贴板直接导入 / 弹窗手动导入复用）
async function importFromCode(code) {
    code = String(code || "").trim().replace(/\s+/g, "");
    if (!code.startsWith(TmpCacheSharePrefix)) throw new Error("分享码格式错误");
    const json = await gzipDecompress(base64ToBytes(code.substring(TmpCacheSharePrefix.length)));
    const data = JSON.parse(json);
    if (!data || typeof data !== "object" || !data.partMap || !data.charmData || !data.weaponData || !data.name) {
        throw new Error("分享码数据不完整或格式不支持（请使用最新版生成的分享码）");
    }
    //分享码里携带的配装名
    let baseName = String(data.name).trim();
    if (!baseName) throw new Error("分享码缺少配装名");
    //重名则加后缀 (2)、(3)...
    let name = baseName;
    let idx = 1;
    while (await CacheObj.get(name)) {
        idx++;
        name = baseName + "(" + idx + ")";
    }
    await execSave(name, data.partMap, data.charmData, data.weaponData, null, data.extreme);
    await loadList();
    await loadCache(name);
    return name;
}

//从「导出全部配装」生成的 JSON 文件导入（批量）
async function importFromFile(file) {
    if (!file) return;
    let text = await file.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error("文件不是有效的 JSON");
    }
    return await importCachesFromObject(data);
}

//把一个 JSON 对象里的配装导入（支持"批量导出格式"与"单个配装格式"）
async function importCachesFromObject(data) {
    if (!data || typeof data !== "object") throw new Error("数据格式错误");
    //批量导出格式：{ caches: [ {name, partMap, charmData, weaponData, extreme, t}, ... ] }
    //单个配装格式：{ name, partMap, charmData, weaponData, extreme, t }
    let list = [];
    if (Array.isArray(data.caches)) {
        list = data.caches;
    } else if (data.partMap && data.charmData && data.weaponData) {
        list = [data];
    } else {
        throw new Error("文件里没有可导入的配装");
    }
    let okCount = 0;
    let lastName = "";
    for (let i = 0; i < list.length; i++) {
        let item = list[i];
        if (!item || !item.partMap || !item.charmData || !item.weaponData) continue;
        let baseName = (item.name && String(item.name).trim()) ? String(item.name).trim() : ("导入配装" + (i + 1));
        //重名则加后缀
        let name = baseName;
        let idx = 1;
        while (await CacheObj.get(name)) {
            idx++;
            name = baseName + "(" + idx + ")";
        }
        await execSave(name, item.partMap, item.charmData, item.weaponData, item.t || null, item.extreme);
        okCount++;
        lastName = name;
    }
    if (!okCount) throw new Error("文件里没有可导入的配装");
    await loadList();
    //批量导入时不自动加载某一套（避免覆盖当前编辑），单个时加载它
    if (okCount === 1) await loadCache(lastName);
    return { count: okCount, name: lastName };
}

//点击「导入配装」：优先读剪贴板尝试直接导入，失败/无效再弹手动输入
async function startImport() {
    let text = "";
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            text = ((await navigator.clipboard.readText()) || "").trim().replace(/\s+/g, "");
        }
    } catch (e) {
        // 读取剪贴板被拒绝 / 不受支持，走手动输入
        console.warn("读取剪贴板失败:", e);
    }

    //剪贴板里是分享码：尝试直接导入（省去弹窗）
    if (text.startsWith(TmpCacheSharePrefix)) {
        showMsg("已从剪贴板导入…");
        try {
            const name = await importFromCode(text);
            showMsg("配装导入成功：" + name);
            window.__mhrsbDirty = false;
            return; //导入成功，不弹窗
        } catch (err) {
            //分享码无效：提示后仍弹出手动输入弹窗，让用户修改/粘贴正确的分享码
            console.error(err);
            showMsg("导入失败:" + (err && err.message ? err.message : err));
        }
    }

    //剪贴板内容不像分享码（或导入失败）：弹出手动输入框
    //仅当剪贴板里确实是一段分享码时才预填，避免把无关内容塞进输入框
    let prefill = text.startsWith(TmpCacheSharePrefix) ? text : "";
    $("#importCacheText").val(prefill);
    $("#importCacheModal").modal("show");
}

async function importTmpCache() {
    try {
        const code = $("#importCacheText").val();
        const name = await importFromCode(code);
        $("#importCacheText").val("");
        $("#importCacheModal").modal("hide");
        showMsg("配装导入成功：" + name);
        window.__mhrsbDirty = false;
    } catch (err) {
        console.error(err);
        showMsg("导入失败:" + err.message);
    }
}

async function execSave(n, p, c, w, t, ext) {
    //ext：保存时的模式（是否极限模式），用于加载时自动切回对应模式；
    //ext 为 undefined 时表示旧数据（不含模式信息），不写入 extreme 字段，加载时保持当前模式
    //t 可能是 Date / ISO 字符串 / 数字时间戳，统一转成 Date，保证排序正确
    let tt;
    if (!t) {
        tt = new Date();
    } else if (t instanceof Date) {
        tt = t;
    } else {
        let d = new Date(t);
        tt = isNaN(d.getTime()) ? new Date() : d;
    }
    let obj = { "name": n, "partMap": p, "charmData": c, "weaponData": w, "t": tt };
    if (ext !== undefined) {
        obj["extreme"] = ext ? 1 : 0;
    }
    await CacheObj.add(n, obj);
}
async function execLoad(n) {

    let cache = null;
    try {
        cache = await CacheObj.get(n);
        if (cache && !cache.name) cache.name = n;
    } catch (err) {
        showMsg("获取缓存失败" + err.message);
    }
    return cache;
}
//删除单个配装：先弹确认，防误删
function delCache(name) {
    showPromptModal({
        title: "删除配装",
        text: "确定删除配装 <strong>" + escapeHtml(name) + "</strong>？<br><span class='text-danger small'>删除后无法恢复！</span>",
        okText: "删除",
        okClass: "btn-danger",
        onOk: function () {
            setTimeout(function () { doDelCache(name); }, 300);
        }
    });
}
//真正执行删除
async function doDelCache(name) {
    await CacheObj.delete(name);
    showMsg("删除成功:" + name);
    await loadList();
}

//删除「我的配装」里的全部配装
async function delAllCaches() {
    try {
        let all = await CacheObj.readAll();
        for (let i = 0; i < all.length; i++) {
            await CacheObj.delete(all[i]["k"]);
        }
        //清掉自定义顺序
        setCustomOrder([]);
        showMsg("已删除全部配装（" + all.length + " 个）");
        await loadList();
    } catch (err) {
        console.error(err);
        showMsg("全部删除失败:" + (err && err.message ? err.message : err));
    }
}

//导出「我的配装」为 JSON 文件
async function exportAllCaches() {
    try {
        let all = await CacheObj.readAll();
        //没有配装时提示，避免导出空文件
        if (!all || !all.length) {
            showMsg("没有可导出的配装");
            return;
        }
        let arr = [];
        for (let i = 0; i < all.length; i++) {
            let v = all[i]["v"] || {};
            arr.push({
                name: all[i]["k"],
                partMap: v.partMap || v.PartMap || {},
                charmData: v.charmData || v.CharmData || {},
                weaponData: v.weaponData || v.WeaponData || {},
                extreme: v.extreme,
                t: v.t
            });
        }
        //按当前"我的配装"显示顺序导出（若没有自定义顺序，则按时间倒序）
        let order = getCustomOrder();
        if (order && order.length) {
            let map = {};
            arr.forEach(a => map[a.name] = a);
            let sorted = [];
            order.forEach(n => { if (map[n]) { sorted.push(map[n]); delete map[n]; } });
            arr.forEach(a => { if (map[a.name]) { sorted.push(a); delete map[a.name]; } });
            arr = sorted;
        }
        let out = {
            app: "MHRSB_Cheater",
            version: APP_VERSION,
            exportTime: new Date().toISOString(),
            count: arr.length,
            caches: arr
        };
        let content = JSON.stringify(out, null, 2);
        let stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
        let fileName = "MHRSB_配装导出_" + stamp + ".json";
        saveTextFile(fileName, content, "application/json");
        showMsg("已导出 " + arr.length + " 个配装");
    } catch (err) {
        console.error(err);
        showMsg("导出失败:" + (err && err.message ? err.message : err));
    }
}

//保存文本为文件（Android WebView 走系统保存框；浏览器走 Blob 下载）
function saveTextFile(fileName, content, mime) {
    mime = mime || "text/plain;charset=utf-8";
    try {
        if (window.Android && typeof window.Android.chooseFile === "function") {
            window.Android.chooseFile(fileName, content);
            showMsg("已调起保存：" + fileName);
        } else {
            const blob = new Blob([content], { type: mime });
            const objectURL = URL.createObjectURL(blob);
            const aTag = document.createElement('a');
            aTag.href = objectURL;
            aTag.download = fileName;
            document.body.appendChild(aTag);
            aTag.click();
            setTimeout(() => {
                URL.revokeObjectURL(objectURL);
                document.body.removeChild(aTag);
            }, 0);
            showMsg("已开始下载：" + fileName);
        }
    } catch (err) {
        console.error("保存失败:", err);
        showMsg("保存失败:" + (err && err.message ? err.message : err));
    }
}

function startRender() {
    isStopRender = false;
    refreshShowArmorData();
}
function stopRender() {
    isStopRender = true;
}

function switcTab() {
    if ($("#menu1").is(':visible')) {
        $("#menu1").hide();
        $("#menu2").show();
        $("#switch").text("切换回炼化");
        //并生成代码
        genAllTemplate();
    } else {
        $("#menu2").hide();
        $("#menu1").show();
        $("#switch").text("切换至代码");
    }
}
function switcMode() {
    setExtremeMode(!isExtremeMode);
}
//设置极限模式开关（on=true 开启）
function setExtremeMode(on) {
    if (isExtremeMode === on) return;
    isExtremeMode = on;
    if (isExtremeMode) {
        $("#switchMode").text("切换至普通模式");
        showMsg("已开启极限模式：所有孔位均可插任意珠子，护石技能等级为15");
    } else {
        $("#switchMode").text("切换至极限模式");
        showMsg("已关闭极限模式");
    }
    //极限模式影响孔位可插入珠子的范围，需刷新所有已被选择的装备
    refreshAllDecorationSel();
    //极限模式下护石技能列表显示的等级为15，需重建列表
    refreshCharmSel();
    genAllTemplate();
}
//刷新所有位置（防具、护石）的珠子可选项
function refreshAllDecorationSel() {
    for (let idx in PartIdxMap) {
        if (CurData.partMap[idx]) {
            initDecorationSel(idx);
        }
    }
    if (CurData.charmData) {
        initDecorationSel("6");
    }
    //武器（位置7）孔位固定，也要刷新（否则极限模式切换后武器珠子不可选）
    if (CurData.weaponData) {
        initDecorationSel("7");
    }
}
function isSkipSkill(hex) {
    var exc = {
        //"2A": { "sname": "耐力夺取", },
        "2B": { "sname": "滑走强化", },
        "2C": { "sname": "吹笛名人", },
        //"2E": { "sname": "炮弹装填", },
        // "35": { "sname": "减轻后坐力", },
        // "36": { "sname": "抑制偏移", },
        //"3C": { "sname": "快吃", },
        // "3D": { "sname": "耳栓", },
        //"3E": { "sname": "风压耐性", },
        //"3F": { "sname": "耐震", },
        // "40": { "sname": "泡沫之舞", },
        "43": { "sname": "火耐性", },
        "44": { "sname": "水耐性", },
        "45": { "sname": "冰耐性", },
        "46": { "sname": "雷耐性", },
        "47": { "sname": "龙耐性", },
        "48": { "sname": "属性异常状态的耐性", },
        "49": { "sname": "毒耐性", },
        "4A": { "sname": "麻痹耐性", },
        "4B": { "sname": "睡眠耐性", },
        //"4C": { "sname": "气绝耐性", },
        "4D": { "sname": "泥雪耐性", },
        "4E": { "sname": "爆破耐性", },
        "4F": { "sname": "植生学", },
        "50": { "sname": "地质学", },
        "52": { "sname": "捕获名人", },
        "53": { "sname": "剥取名人", },
        //"54": { "sname": "幸运", },
        //"55": { "sname": "砥石使用高速化", },
        "56": { "sname": "炸弹客", },
        //"57": { "sname": "最爱蘑菇", },
        //"59": { "sname": "广域化", },
        //"5A": { "sname": "满足感", },
        "5C": { "sname": "不屈", },
        //"5D": { "sname": "减轻胆怯", },
        "5E": { "sname": "跳跃铁人", },
        "5F": { "sname": "剥取铁人", },
        //"60": { "sname": "饥饿耐性", },
        "61": { "sname": "飞身跃入", },
        "62": { "sname": "佯动", },
        "63": { "sname": "骑乘名人", },
        //"69": { "sname": "墙面移动", },
        //"6A": { "sname": "逆袭", },
        "6D": { "sname": "风纹的一致", },
        "6E": { "sname": "雷纹的一致", },
        "6F": { "sname": "风雷合一", },
        "7B": { "sname": "提供", },
        // "7E": { "sname": "零件改造", },
        "81": { "sname": "走壁移动【翔】", },
        "85": { "sname": "迅之气息", },
    }
    return !!exc[hex];
}
function initCharmSkillData() {
    let m1 = [];
    let m2 = [];
    for (let hex in skill_data) {
        let d = skill_data[hex];
        if (isSkipSkill(hex)) {
            continue;
        }
        if (d["p1Max"]) {
            m1.push(d);
        }
        if (d["p2Max"]) {
            m2.push(d);
        }
    }
    m1.sort(function (a, b) { return parseInt(a.hex, 16) - parseInt(b.hex, 16) });
    m2.sort(function (a, b) { return parseInt(a.hex, 16) - parseInt(b.hex, 16) });
    CurData.charmData["sel1"] = m1;
    CurData.charmData["sel2"] = m2;
}

function initDecorationData() {
    let sl = [4, 3, 2, 1];
    for (let j = 0; j < sl.length; j++) {
        let slot = sl[j];
        let a = [];
        for (let i in decoration_data) {
            let di = decoration_data[i];
            DecoratrionNameMap[di["dname"]] = di;
            DecoratrionHexLvMap[di["hex"] + di["lv"]] = di;
            if (slot >= di["slot"]) {
                a.push(di);
            }
        }
        a.sort(function (a, b) {
            let n = b.slot - a.slot;
            if (n == 0) {
                n = parseInt(a.hex, 16) - parseInt(b.hex, 16);
            }
            return n;
        });
        let str = ""
        for (let i = 0; i < a.length; i++) {
            let d = a[i];
            let dname = d["dname"];
            let skill_hex = d["hex"];
            let lv = d["lv"];
            // opt.value = `${partIdx}_${idx}_${skill_hex}_${lv}`;
            str = str + `<option value="${dname}">`;
        }
        $("#slot" + slot).html(str);
    }
}
function getDecorationDataByHexLv(hex, lv) {
    return DecoratrionHexLvMap[hex + lv];
}
function getDecorationDataByDName(dname) {
    return DecoratrionNameMap[dname];
}
function initHtml() {

    let vHtml = "";
    for (let v in versionMap) {
        vHtml = vHtml + `<option value="${v}" text="${v}">${v}</option>`;
    }
    $("#version").html(vHtml);

    let tmp = $(".armor_container").html();

    let html = "";
    for (let idx in PartIdxMap) {
        let n = PartIdxMap[idx];
        let t = $(tmp);

        t.find(".armor_pos").html(idx + "_" + getBoxNumberHex(idx));
        t.find(".armor_pos_label").html(idx);
        t.find(".armor_pos_name").html(PartIdxNameCN[idx] || "");
        let tmp2 = t.find(".k_skill_tbody").html();
        let tr = "";
        for (let i = 0; i < 7; i++) {
            tr = tr + tmp2;
        }
        let dsel = t.find(".decoration_select_container").html();
        let dselStr = "";
        for (let i = 0; i < 3; i++) {
            let s = $(dsel);
            s.addClass("decoration_input_" + idx + "_" + i);
            s.attr("id", "decoration_input_" + idx + "_" + i);
            dselStr = dselStr + s[0].outerHTML;
        }
        t.find(".decoration_select_container").html(dselStr);

        t.find(".k_skill_tbody").html(tr);

        t.find(".k_skill_tbody").addClass("k_skill_tbody_" + idx);
        t.find(".armor_select").addClass("armor_select_" + idx);
        t.find(".armor_select_display").addClass("armor_select_display_" + idx);
        t.find(".k_skill_display").addClass("k_skill_display_" + idx);
        t.find(".k_skill_change_display").addClass("k_skill_change_display_" + idx);
        t.find(".armor_pos").addClass("armor_pos_" + idx);
        t.find(".armor_slot").addClass("armor_slot_" + idx);
        t.find(".armor_cost").addClass("armor_cost_" + idx);

        t.find(".armor_skill").addClass("armor_skill_" + idx);


        html += `
<div class="col-12 col-md-6 col-xl-4 armor_container_${idx}">
    <div class="app-card h-100 mb-0">
        ${t.html()}
    </div>
</div>`;
    }
    $("#armor_body").html(html);
    initArmorSelect();

}

function bindEvents() {
    $(".armor_select").on("change", function (event) {
        onSelectArmor(event.target.value);
    });
    $(".k_skill_select").on("change", function (event) {
        onSelectKSkill(event.target.value);
    });
    $(".k_skill_change").on("change", function (event) {
        onSelectChangeSkill(event.target.value);
    });
    $(".charm_skill_select").on("change", function (event) {
        onSelectCharmSkill(event.target.value)
    });
    $("#charm_slot_select").on("change", function (event) {
        onSelectCharmSlot(event.target.value)
    });


    $(".decoration_input").on("change", function (event) {
        onInputDecoration(event.target, event.target.value)
    });


    $("#saveCache").on("click", function (event) {
        saveCache();
    });
    //初始化确认弹窗 → 确认按钮：刷新页面（真正的重置）
    $("#initConfirmBtn").off("click").on("click", function () {
        $("#initConfirmModal").modal("hide");
        //已确认初始化，清除"未保存"标记，避免刷新时再弹一次"确认离开"
        window.__mhrsbDirty = false;
        location.reload();
    });
    //点「返回顶部」按钮：平滑滚回顶部
    $("#backToTop").off("click").on("click", function () {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
    //技能一览：展开/收起切换（默认折叠，状态存 localStorage）
    function applySkillInfoCollapsed(collapsed) {
        let el = document.getElementById("skillInfo");
        let btn = document.getElementById("skillInfoToggle");
        if (!el || !btn) return;
        el.classList.toggle("is-collapsed", collapsed);
        btn.setAttribute("aria-expanded", collapsed ? "false" : "true");
        let txt = btn.querySelector(".si-toggle-text");
        if (txt) txt.textContent = collapsed ? "展开技能一览" : "收起技能一览";
    }
    let skillInfoCollapsed = true;
    try { skillInfoCollapsed = localStorage.getItem("MHRSB_skillInfo_collapsed") !== "0"; } catch (e) { }
    applySkillInfoCollapsed(skillInfoCollapsed);
    $("#skillInfoToggle").off("click").on("click", function () {
        //当前是折叠 → 展开；当前是展开 → 折叠
        let nowCollapsed = document.getElementById("skillInfo").classList.contains("is-collapsed");
        applySkillInfoCollapsed(!nowCollapsed);
        try { localStorage.setItem("MHRSB_skillInfo_collapsed", (!nowCollapsed) ? "1" : "0"); } catch (e) { }
    });
    //滚动超过 400px 时显示按钮
    $(window).off("scroll.backToTop").on("scroll.backToTop", function () {
        $("#backToTop").toggleClass("show", window.scrollY > 400);
    });
    //PWA 安装引导
    initInstallHint();
    //绑定通用输入/确认弹窗
    bindPromptModal();
    //配装搜索：输入即过滤
    $("#cacheSearchInput").off("input").on("input", function () {
        loadList();
    });
    //配装搜索：清除
    $("#cacheSearchClear").off("click").on("click", function () {
        $("#cacheSearchInput").val("");
        loadList();
        if (!isTouchDevice()) document.getElementById("cacheSearchInput").focus();
    });
    //正序 / 逆序：整体翻转显示（不改手动排序数据）
    $("#cacheSortToggle").off("click").on("click", function () {
        setSortDir(getSortDir() === "asc" ? "desc" : "asc");
        loadList();
    });
    //打开"我的配装"抽屉时，若搜索框有残留则清掉（避免下次打开还是过滤状态）
    $("#historyDrawer").off("shown.bs.offcanvas").on("shown.bs.offcanvas", function () {
        let el = document.getElementById("cacheSearchInput");
        if (el && el.value) {
            el.value = "";
            loadList();
        }
    });
    //抽屉内容滚动时，给顶部固定区加分隔线（提示"已吸顶"）
    $(document).off("scroll.cacheSticky", ".offcanvas-body").on("scroll.cacheSticky", ".offcanvas-body", function () {
        let st = this.querySelector(".cache-drawer-sticky");
        if (st) st.classList.toggle("is-stuck", this.scrollTop > 2);
    });
    //点击「导入配装」：先尝试读剪贴板直接导入，失败再弹手动输入
    $("#importTmpCache").on("click", function (event) {
        startImport();
    });
    $("#confirmImportTmpCache").on("click", function () {
        importTmpCache();
    });
    //选择文件导入（支持「导出全部配装」生成的 JSON）
    $("#importFileBtn").on("click", async function () {
        let f = document.getElementById("importFileInput").files[0];
        if (!f) {
            showMsg("请先选择文件");
            return;
        }
        try {
            let r = await importFromFile(f);
            showMsg("导入成功：" + r.count + " 个配装");
            $("#importFileInput").value = "";
            $("#importCacheModal").modal("hide");
        } catch (err) {
            console.error(err);
            showMsg("导入失败:" + (err && err.message ? err.message : err));
        }
    });
    $("#switch").on("click", function (event) {
        switcTab();
    });
    $("#switchMode").on("click", function (event) {
        switcMode();
    });


    $("#version").on("change", function (event) {
        currentVersion = versionMap[event.target.value];
        $("#bid").text(currentVersion.BID);
        $("#version_code").text(currentVersion.code);
        genAllTemplate();
    });
    $("#auto_gen_armor").on("change", function (event) {
        AutoGen = event.target.checked;
        genAllTemplate();
    });
    $("#zipSame").on("change", function (event) {
        ZipSameItem = event.target.checked;
        zipSame();
    });
    $("#charm_skill_max").on("change", function (event) {
        CharmSkillMax = event.target.checked;
        genAllTemplate();
    });

    $("#copy_to_clipboard").on("click", function (event) {
        copyToClipboard();
    });
    $("#download").on("click", function (event) {
        downloadTxt();
    });

    $(".dropdown-menu-cache").on("click", ".cacheItem", function (event) {
        loadCache($(this).attr("data-name"));
        //加载后关闭抽屉
        var dr = document.getElementById("historyDrawer");
        if (dr && window.bootstrap) {
            var oc = bootstrap.Offcanvas.getInstance(dr) || new bootstrap.Offcanvas(dr);
            oc.hide();
        }
    });

    $(".dropdown-menu-cache").on("click", ".deleteCache", function (event) {
        delCache($(this).attr("data-name"));
    });

    //上移 / 下移
    $(".dropdown-menu-cache").on("click", ".moveCacheUp", function (event) {
        moveCacheItem($(this).attr("data-name"), "up");
    });
    $(".dropdown-menu-cache").on("click", ".moveCacheDown", function (event) {
        moveCacheItem($(this).attr("data-name"), "down");
    });

    //导出全部配装
    $(document).off("click", "#exportAllCaches").on("click", "#exportAllCaches", function (event) {
        exportAllCaches();
    });
    //全部删除：输入 DELETE 才启用确认按钮
    $(document).off("input", "#delAllConfirmInput").on("input", "#delAllConfirmInput", function () {
        let ok = ($(this).val().trim().toUpperCase() === "DELETE");
        $("#delAllConfirmBtn").prop("disabled", !ok);
    });
    $(document).off("click", "#delAllConfirmBtn").on("click", "#delAllConfirmBtn", async function () {
        if ($("#delAllConfirmInput").val().trim().toUpperCase() !== "DELETE") return;
        await delAllCaches();
        //清空输入并关闭弹窗
        $("#delAllConfirmInput").val("");
        $("#delAllConfirmBtn").prop("disabled", true);
        if (window.bootstrap) {
            bootstrap.Modal.getOrCreateInstance(document.getElementById("delAllModal")).hide();
        }
    });

    $(".dropdown-menu-cache").on("click", ".shareCache", function (event) {
        shareCacheByName($(this).attr("data-name"));
    });

    $(".dropdown-menu-cache").on("click", ".renameCache", function (event) {
        renameCache($(this).attr("data-name"));
    });

    $(".dropdown-menu-compare").on("click", ".addToCompare", function (event) {
        addToCompare($(this).attr("data-name"))
    });

    //直接点击配装名也能添加对比
    $(".dropdown-menu-compare").on("click", ".compareItem", function (event) {
        addToCompare($(this).attr("data-name"))
    });

    $("#skillInfo").on("click", ".skill_info_div", function (event) {
        let targ = event.target;
        clickSkillInfo($(targ).find("button").attr("id"), $(targ).parent().attr("title"));
    });
    $("#skillInfo").on("click", ".skill_info_btn", function (event) {
        let targ = event.target;
        if ($(targ).prop("nodeName").toUpperCase() == "SPAN") {
            targ = $(targ).parent();
        }
        clickSkillInfo($(targ).attr("id"), $(targ).parent().parent().attr("title"));
        event.stopPropagation();
    });


    $("#skill_table_head").on("click", ".remove_compare", function (event) {
        let targ = event.target;
        removeFromCompare($(targ).attr("name"));
    });

    //点"临时配装"的 × → 清空草稿（不是从对比移除）
    $("#skill_table_head").on("click", ".clear_draft", function (event) {
        event.stopPropagation();
        clearDraft();
    });

//点击对比表头的配装名 → 切换到该配装
        $("#skill_table_head").on("click", ".switch_to_cache", function (event) {
            //点的是删除/清空按钮(×)时不触发切换
            if ($(event.target).hasClass("remove_compare")) return;
            if ($(event.target).hasClass("clear_draft")) return;
            let name = $(this).attr("data-name");
            if (!name) return;
            //已经在编辑的配装，无需切换
            if (name === CurData.name) return;
            //"临时配装"是纯内存草稿，直接从内存切换（不查缓存）
            if (name === DraftKey) {
                switchToDraft();
                return;
            }
            loadCache(name);
        });


}


function getSkillNameByHex(hex) {
    let sd = skill_data[hex];
    if (sd) {
        return sd["sname"];
    }
    return "";
}
function getSkillMaxByHex(hex) {
    let sd = skill_data[hex];
    //技能不存在时(如空技能"00")返回0，避免读取 undefined.max 报错
    return sd ? sd["max"] : 0;
}

function getArmorCostById(id) {
    id = id.split("_")[0];
    return armor_pool_cost[id]["cost"];
}

function getArmorPoolById(id) {
    id = id.split("_")[0];
    return armor_pool_cost[id]["pool"];
}
function getAddSkillListByCost(cost) {
    return cost_skill_hex["" + cost];
}

function getSkillAddByArmorId(id) {
    id = id.split("_")[0];
    let pool_id = armor_pool_cost[id]["pool"];
    return k_skill_add[pool_id.toString()];
}
function getDefStatusByPoolAndHex(pool_id, hex) {
    let name = "";
    let p = k_skill_add[pool_id.toString()];
    for (let i = 0; i < p.length; i++) {
        if (p[i]["hex"] == hex) {
            name = p[i]["name"];
            break;
        }
    }
    let dM = {
        "防御": "def_p",
        "火耐性": "def_f",
        "水耐性": "def_w",
        "雷耐性": "def_t",
        "冰耐性": "def_i",
        "龙耐性": "def_d",
    }
    let key = "", value = 0;
    if (name) {
        for (let x in dM) {
            if (new RegExp(x).test(name)) {
                key = dM[x];
                value = parseInt(name.split(x)[1]);
                break;
            }
        }

    }
    return [key, value];
}

function getArmorById(id) {
    return armor_list[id];
}

function getCharmSlotMap(sklvType) {
    //目前最多应该是411
    //暂时版本 所有技能组合都能出这类孔位
    return ["411", "331", "222"];
    let m = {
        "SS": ["411", "331", "222"],
        "SA": ["411", "331", "222"],
        "SB": ["411", "331", "222"],
        "SC": ["411", "331", "222"],
        "S": ["411", "331", "222"],
        "AS": ["411", "331", "222"],
        "AA": ["411", "331", "222"],
        "AB": ["411", "331", "222"],
        "AC": ["411", "331", "222"],
        "A": ["411", "331", "222"],
        "BS": ["411", "331", "222"],
        "BA": ["411", "331", "222"],
        "BB": ["411", "331", "222"],
        "BC": ["411", "331", "222"],
        "B": ["411", "331", "222"],
        "CS": ["411", "331", "222"],
        "CA": ["411", "331", "222"],
        "CB": ["411", "331", "222"],
        "CC": ["411", "331", "222"],
        "C": ["411", "331", "222"],
    }

    return m[sklvType];
}

function initCharmSel() {
    let s1 = CurData.charmData["sel1"] || [];
    let s2 = CurData.charmData["sel2"] || [];
    for (let i = 0; i < s1.length; i++) {
        let o = s1[i];
        let opt = document.createElement("option");
        opt.value = "1_" + o["lvType"] + "_" + o["hex"] + "_" + o["p1Max"];
        //极限模式下显示等级为15
        opt.text = o["sname"] + " " + (isExtremeMode ? 15 : o["p1Max"]);
        $("#charm_skill_select1").append(opt);
    }
    for (let i = 0; i < s2.length; i++) {
        let o = s2[i];
        let opt = document.createElement("option");
        opt.value = "2_" + o["lvType"] + "_" + o["hex"] + "_" + o["p2Max"];
        //极限模式下显示等级为15
        opt.text = o["sname"] + " " + (isExtremeMode ? 15 : o["p2Max"]);
        $("#charm_skill_select2").append(opt);
    }
}

//根据当前模式重建护石技能下拉列表
//注意：切换模式时"保持当前护石技能等级不变"（不强制15、也不做特殊恢复）
function refreshCharmSel() {
    //数据未就绪时不处理，避免刷新报错影响后续渲染
    if (!CurData.charmData || !CurData.charmData["sel1"] || !CurData.charmData["sel2"]) {
        return;
    }
    //记住当前技能 hex 与当前等级（重建下拉会按 option 上限重设等级，这里用于原样恢复）
    let hex1 = CurData.charmData["skill1Hex"];
    let hex2 = CurData.charmData["skill2Hex"];
    let lv1 = parseInt(CurData.charmData["skill1Lv"], 10) || 0;
    let lv2 = parseInt(CurData.charmData["skill2Lv"], 10) || 0;
    CharmRestoreLv1 = lv1;
    CharmRestoreLv2 = lv2;
    isCharmRestoring = true;
    initCharmSel2();
    selectCharmSkillOption("#charm_skill_select1", "1", hex1);
    selectCharmSkillOption("#charm_skill_select2", "2", hex2);
    isCharmRestoring = false;
    //原样恢复当前等级（不随模式变化）
    if (hex1 && hex1 != "00" && lv1 > 0) {
        CurData.charmData["skill1Lv"] = lv1;
        $("#charm_skill_select1").find("option:selected").text(
            (skill_data[hex1] ? skill_data[hex1]["sname"] : "") + " " + lv1);
    }
    if (hex2 && hex2 != "00" && lv2 > 0) {
        CurData.charmData["skill2Lv"] = lv2;
        $("#charm_skill_select2").find("option:selected").text(
            (skill_data[hex2] ? skill_data[hex2]["sname"] : "") + " " + lv2);
    }
    syncCharmDisplay("1");
    syncCharmDisplay("2");
    //重建护石孔位下拉（孔位选项与技能无关，但要保证始终存在）
    let slotCur = CurData.charmData["slot"] || "000";
    initCharmSlotSel();
    $("#charm_slot_select").val(slotCur);
}

//清空并重建护石技能下拉列表（不恢复之前选中项）
function initCharmSel2() {
    $("#charm_skill_select1").html(`<option>-----</option>`);
    $("#charm_skill_select2").html(`<option>-----</option>`);
    initCharmSel();
}

function initCharmSlotSel() {
    let h = getCharmSlotMap(CurData.charmData["skill1Type"] + CurData.charmData["skill2Type"]);
    let elm = $("#charm_slot_select");
    //优先用数据层的 slot 恢复选中项（避免被 UI 旧值影响）；数据层为空时回退到 UI 当前值
    let ov = CurData.charmData["slot"];
    if (!ov) ov = elm.val();
    elm.html(`<option value="000">-----</option>`);
    if (h && h.length) {
        for (let i = 0; i < h.length; i++) {
            let o = h[i];
            let opt = document.createElement("option");
            opt.value = o;
            opt.text = o;
            elm.append(opt);
        }
    }
    //恢复之前选中值；若无效（如初始占位没有 value 或值不存在），回到"-----"占位项
    if (!ov || !elm.find("option[value='" + ov + "']").length) {
        ov = "000";
    }
    elm.val(ov);
}

function initTable() {
    let str = "";
    for (let i = 0; i < 5; i++) {
        let partIdx = "" + (i + 1);
        str = str + `<tr>
            <td id ="armor_${partIdx}_name"></td>
            <td id="armor_${partIdx}_pos">${partIdx}</td>
            <td id="def_${partIdx}_p">0</td>
            <td id="def_${partIdx}_f">0</td>
            <td id="def_${partIdx}_w">0</td>
            <td id="def_${partIdx}_t">0</td>
            <td id="def_${partIdx}_i">0</td>
            <td id="def_${partIdx}_d">0</td>
            <td id="slot_${partIdx}">0</td>
        </tr>`;
    }
    str = str + `<tr>
        <td>合计</td>
        <td>-</td>
        <td id="def_total_p">0</td>
        <td id="def_total_f">0</td>
        <td id="def_total_w">0</td>
        <td id="def_total_t">0</td>
        <td id="def_total_i">0</td>
        <td id="def_total_d">0</td>
    </tr>`

    document.getElementById("def_table").innerHTML = str;
    document.getElementById("skill_table").innerHTML = "";//`<tr><td>-</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td></tr>`;

}

function initArmorSelect() {
    let serial = [];
    for (i in armor_list) {
        var o = armor_list[i];
        //R7防具
        if ((o["rank"] > 7 & o["bougyo"] > 0)) {
            if (!serial.includes(o["id"])) {
                serial.push(o["id"]);
            }
        }
    }
    serial.reverse();
    for (let i = 0; i < serial.length; i++) {
        let id = serial[i];
        for (let partIdx in PartIdxMap) {
            let o = armor_list[id + "_" + partIdx];
            if (o) {
                let p = o["parts_id"].toString();
                let opt = document.createElement("option");
                opt.value = o["id"].toString() + "_" + o["parts_id"].toString();
                opt.text = o["name"];
                let s = slot_simplify(o);
                let str = `孔位:${s}\n技能:`;
                for (let k = 0; k < o["skill"].length; k++) {
                    let sk = o["skill"][k];
                    str = str + `\n${sk["sname"]}:${sk["lv"]}`;
                }
                opt.title = str;
                $(".armor_select_" + p).append(opt);
            }

        }
    }
    buildArmorSearchData();
    bindArmorSearch();
}

// ===== 装备搜索面板 =====
// 按部位缓存可搜索的装备数据（与 initArmorSelect 相同的筛选规则）
var ArmorSearchMap = {};   // { partIdx: [{id, name, slot, skills:[...], rank}] }
function buildArmorSearchData() {
    ArmorSearchMap = {};
    for (let partIdx in PartIdxMap) {
        ArmorSearchMap[partIdx] = [];
    }
    let seen = {};
    for (let key in armor_list) {
        let o = armor_list[key];
        if (!o || !(o["rank"] > 7 && o["bougyo"] > 0)) continue;
        let p = "" + o["parts_id"];
        if (!ArmorSearchMap[p]) continue;
        let id = o["id"] + "_" + o["parts_id"];
        if (seen[id]) continue;
        seen[id] = true;
        let skills = [];
        if (o["skill"]) {
            for (let k = 0; k < o["skill"].length; k++) {
                skills.push(o["skill"][k]["sname"] + " " + o["skill"][k]["lv"]);
            }
        }
        ArmorSearchMap[p].push({
            id: id,
            idNum: parseInt(o["id"], 10) || 0,
            name: o["name"] || "",
            slot: slot_simplify(o),
            skills: skills,
            def: o["bougyo_max"] || o["bougyo"] || 0,
            res: [o["def_f"] || 0, o["def_w"] || 0, o["def_t"] || 0, o["def_i"] || 0, o["def_d"] || 0],
            //稀有度（R）与怪异点数消耗（cost），用于列表展示
            rank: parseInt(o["rank"], 10) || 0,
            cost: (armor_pool_cost[o["id"]] && armor_pool_cost[o["id"]]["cost"] != null) ? armor_pool_cost[o["id"]]["cost"] : null
        });
    }
    //按装备 id 从大到小排序（与原有下拉顺序一致）
    for (let p in ArmorSearchMap) {
        ArmorSearchMap[p].sort(function (a, b) {
            return b.idNum - a.idNum;
        });
    }
}

//当前搜索模式："armor" 装备 / "deco" 珠子
var ArmorSearchMode = "armor";
//当前正在搜索的部位
var ArmorSearchPartIdx = null;

//是否触屏设备（手机/平板）——触屏不自动聚焦，避免弹出输入法
function isTouchDevice() {
    return ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);
}

function bindArmorSearch() {
    //移除所有珠子输入框的原生 datalist，改用自建搜索面板
    $(".decoration_input").removeAttr("list");
    //初始化武器（位置7）珠子框（孔位固定444），使其可点开珠子搜索面板
    initDecorationSel("7");
    //点击只读输入框打开搜索面板
    $(document).off("click", ".armor_select_display").on("click", ".armor_select_display", function () {
        let cls = $(this).attr("class") || "";
        let m = cls.match(/armor_select_display_(\d+)/);
        openArmorSearch(m ? m[1] : null);
    });
    //点击珠子输入框打开搜索面板
    $(document).off("click", ".decoration_input").on("click", ".decoration_input", function () {
        let cls = $(this).attr("class") || "";
        let m = cls.match(/decoration_input_(\d+)_(\d+)/);
        if (m) openDecoSearch(m[1], m[2], this);
    });
    //点击词条只读框打开词条面板
    $(document).off("click", ".k_skill_display").on("click", ".k_skill_display", function () {
        let cls = $(this).attr("class") || "";
        let m = cls.match(/k_skill_display_(\d+)/);
        if (!m) return;
        let partIdx = m[1];
        //找到这一行在 tbody 中的行号
        let tr = $(this).closest("tr");
        let idx = tr.parent().find("tr").index(tr);
        if (idx < 0) return;
        openKSkillSearch(partIdx, idx, this);
    });
    //点击技能只读框打开技能面板
    $(document).off("click", ".k_skill_change_display").on("click", ".k_skill_change_display", function () {
        if ($(this).prop("disabled")) return;
        let cls = $(this).attr("class") || "";
        let m = cls.match(/k_skill_change_display_(\d+)/);
        if (!m) return;
        let partIdx = m[1];
        let tr = $(this).closest("tr");
        let idx = tr.parent().find("tr").index(tr);
        if (idx < 0) return;
        openSkillSearch(partIdx, idx, this);
    });
    //点击护石技能只读框打开护石技能面板
    $(document).off("click", ".charm_skill_display").on("click", ".charm_skill_display", function () {
        let which = $(this).attr("data-charm");
        openCharmSearch(which);
    });
    //【键盘可达】所有"只读选择框"加 tabindex，支持 Tab 聚焦 + Enter/Space 打开面板
    // 使用事件委托，动态生成的框（装备/词条/珠子等）也自动生效
    $(document)
        .off("focusin.a11y", ".armor_select_display, .decoration_input, .k_skill_display, .k_skill_change_display, .charm_skill_display")
        .on("focusin.a11y", ".armor_select_display, .decoration_input, .k_skill_display, .k_skill_change_display, .charm_skill_display", function () {
            // 只在未设置时补一次，避免重复
            if (this.getAttribute("tabindex") === null) {
                this.setAttribute("tabindex", "0");
            }
        });
    $(document)
        .off("keydown.a11y", ".armor_select_display, .decoration_input, .k_skill_display, .k_skill_change_display, .charm_skill_display")
        .on("keydown.a11y", ".armor_select_display, .decoration_input, .k_skill_display, .k_skill_change_display, .charm_skill_display", function (e) {
            if ($(this).prop("disabled")) return;
            // Enter 或 空格 → 等同于点击，打开对应面板
            if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                $(this).trigger("click");
            }
        });
    //搜索输入
    $(document).off("input", "#armorSearchInput").on("input", "#armorSearchInput", function () {
        renderArmorSearchList($(this).val());
    });
    //护石技能面板：点"确认选择" → 应用技能+等级
    $(document).off("click", "#charmSearchConfirm").on("click", "#charmSearchConfirm", function () {
        if (ArmorSearchMode !== "charm" || !CharmSearchInfo || !CharmSearchPickedHex) return;
        let lv = $("#charmLevelSelect").val();
        selectCharmFromSearch(CharmSearchPickedHex, lv);
    });
    //点击列表项 → 选中
    $(document).off("click", ".armor-search-item").on("click", ".armor-search-item", function () {
        if (ArmorSearchMode === "deco") {
            selectDecoFromSearch($(this).attr("data-id"));
        } else if (ArmorSearchMode === "kskill") {
            selectKSkillFromSearch($(this).attr("data-val"));
        } else if (ArmorSearchMode === "skill") {
            selectSkillFromSearch($(this).attr("data-val"));
        } else if (ArmorSearchMode === "charm") {
            //护石技能：先选中并显示等级行，再由用户选等级（选等级后自动应用）
            pickCharmSkill($(this).attr("data-hex"), $(this).attr("data-max"), this);
        } else {
            selectArmorFromSearch($(this).attr("data-id"));
        }
    });
    //清除
    $("#armorSearchClear").off("click").on("click", function () {
        if (ArmorSearchMode === "deco") {
            clearDecoFromSearch();
            return;
        }
        if (ArmorSearchPartIdx != null) {
            let p = ArmorSearchPartIdx;
            CurData.partMap[p] = null;
            $(".armor_select_" + p).val("-----");
            $(".armor_select_display_" + p).val("");
            refreshShowArmorData();
            showMsg("已清除位置" + p + "的装备");
        }
        if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
    });
    //不设置词条/技能（词条、技能、护石技能模式专用）
    $("#armorSearchNone").off("click").on("click", function () {
        if (ArmorSearchMode === "skill") {
            selectSkillFromSearch("__none__");
        } else if (ArmorSearchMode === "charm") {
            clearCharmFromSearch();
        } else {
            selectKSkillFromSearch("__none__");
        }
    });
}

function openArmorSearch(partIdx) {
    if (!partIdx) return;
    //兜底：若搜索数据尚未构建（初始化时机问题），此处现建一次
    if (!ArmorSearchMap[partIdx] || !ArmorSearchMap[partIdx].length) {
        buildArmorSearchData();
    }
    ArmorSearchMode = "armor";
    ArmorSearchPartIdx = partIdx;
    $("#armorSearchModalLabel").text("选择装备 · 位置" + partIdx);
    $("#armorSearchInput").attr("placeholder", "输入装备名 / 技能名搜索…").val("");
    $("#armorSearchClear").removeClass("d-none").text("清除装备");
    $("#armorSearchNone").addClass("d-none");
    $("#charmSearchConfirm").addClass("d-none");
    renderArmorSearchList("");
    if (window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).show();
    }
    //自动聚焦搜索框：仅非触屏（桌面）执行，触屏不聚焦以避免弹出输入法
    if (!isTouchDevice()) {
        setTimeout(function () {
            let inp = document.getElementById("armorSearchInput");
            if (inp) inp.focus();
        }, 300);
    }
}

//PWA 安装引导：绑定「安装」「关闭」按钮
function initInstallHint() {
    $("#installBtn").off("click").on("click", async function () {
        if (!DeferredInstallPrompt) {
            showMsg("当前环境不支持自动安装，可用浏览器菜单「添加到主屏幕」");
            return;
        }
        DeferredInstallPrompt.prompt();
        try {
            await DeferredInstallPrompt.userChoice;
        } catch (e) { }
        DeferredInstallPrompt = null;
        $("#installHint").addClass("d-none");
    });
    $("#installClose").off("click").on("click", function () {
        //记住用户"不再提示"的选择
        try { localStorage.setItem("MHRSB_install_dismissed", "1"); } catch (e) { }
        $("#installHint").addClass("d-none");
    });
}

//更新搜索面板"共 N 项"提示（通用）
// $el: 计数容器 jQuery 对象；n: 数量；unit: 单位文字；extra: 额外说明（如"仅显示前 200 项"）
function updateSearchCount($el, n, unit, extra) {
    if (!$el || !$el.length) return;
    if (!n) {
        $el.text("");
        return;
    }
    let txt = "共 " + n + " " + unit;
    if (extra) txt += "（" + extra + "）";
    $el.text(txt);
}

function renderArmorSearchList(keyword) {
    if (ArmorSearchMode === "deco") {
        renderDecoSearchList(keyword);
        return;
    }
    if (ArmorSearchMode === "kskill") {
        renderKSkillSearchList(keyword);
        return;
    }
    if (ArmorSearchMode === "skill") {
        renderSkillSearchList(keyword);
        return;
    }
    if (ArmorSearchMode === "charm") {
        renderCharmSearchList(keyword);
        return;
    }
    if (ArmorSearchPartIdx == null) return;
    let list = ArmorSearchMap[ArmorSearchPartIdx] || [];
    let kw = (keyword || "").trim().toLowerCase();
    let curId = "";
    let cur = CurData.partMap[ArmorSearchPartIdx];
    if (cur && cur["eq_id"]) curId = cur["eq_id"];

    let html = "";
    let shown = 0;
    for (let i = 0; i < list.length; i++) {
        let a = list[i];
        if (kw) {
            let nameHit = a.name.toLowerCase().indexOf(kw) >= 0;
            let skillHit = a.skills.some(function (s) { return s.toLowerCase().indexOf(kw) >= 0; });
            if (!nameHit && !skillHit) continue;
        }
        shown++;
        if (shown > 200) break; // 上限，避免过多 DOM
        let skillStr = a.skills.length ? a.skills.join(" / ") : "无技能";
        let slotStr = a.slot && a.slot !== "000" ? a.slot : "-";
        let active = (a.id === curId) ? " active" : "";
        let res = a.res || [0, 0, 0, 0, 0];
        //稀有度 R 与怪异点数消耗
        let rankStr = a.rank ? ("R" + a.rank) : "";
        let costStr = (a.cost != null && a.cost !== "") ? ("点数 " + a.cost) : "";
        html += `<button type="button" class="armor-search-item${active}" data-id="${a.id}">
            <div class="asi-main">
                <span class="asi-name">${a.name}</span>
                <span class="asi-badges">
                    ${rankStr ? `<span class="asi-badge asi-badge-rank rank-${a.rank}">${rankStr}</span>` : ""}
                    <span class="asi-badge asi-badge-slot">孔${slotStr}</span>
                    <span class="asi-badge asi-badge-def">防${a.def}</span>
                    ${costStr ? `<span class="asi-badge asi-badge-cost">${costStr}</span>` : ""}
                </span>
            </div>
            <div class="asi-res">
                <span class="asi-res-item">火${res[0]}</span>
                <span class="asi-res-item">水${res[1]}</span>
                <span class="asi-res-item">雷${res[2]}</span>
                <span class="asi-res-item">冰${res[3]}</span>
                <span class="asi-res-item">龙${res[4]}</span>
            </div>
            <div class="asi-skills">${skillStr}</div>
        </button>`;
    }
    if (!shown) {
        html = `<div class="armor-search-empty">没有找到匹配的装备</div>`;
    }
    updateSearchCount($("#armorSearchCount"), shown, "件装备");
    document.getElementById("armorSearchList").innerHTML = html;
}

function selectArmorFromSearch(id) {
    if (!id) return;
    let p = ArmorSearchPartIdx;
    if (p == null) return;
    //同步隐藏的 select 的值，保证既有逻辑一致
    let sel = $(".armor_select_" + p);
    //确保 option 存在（initArmorSelect 已填充）
    sel.val(id);
    if (sel.val() !== id) {
        //极端情况：option 不存在，则动态补一个
        let opt = document.createElement("option");
        opt.value = id;
        sel.append(opt);
        sel.val(id);
    }
    onSelectArmor(id);
    //更新只读显示框
    let opt2 = sel.find("option[value='" + id + "']");
    let displayName = opt2.length ? opt2.text() : id;
    $(".armor_select_display_" + p).val(displayName);
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
}

// ===== 珠子搜索面板 =====
//当前正在搜索的珠子输入框信息
var DecoSearchInfo = null;   // {partIdx, idx, el, maxSlot}

//构建某孔位可插入的珠子列表
function buildDecoSearchList(maxSlot) {
    let list = [];
    for (let i in decoration_data) {
        let di = decoration_data[i];
        if (di["slot"] > maxSlot) continue;
        let skName = "";
        if (skill_data[di["hex"]]) skName = skill_data[di["hex"]]["sname"] || "";
        list.push({
            hex: di["hex"],
            lv: di["lv"],
            slot: di["slot"],
            dname: di["dname"],
            skill: skName
        });
    }
    //按孔位从大到小、再按 hex 排序
    list.sort(function (a, b) {
        let n = b.slot - a.slot;
        if (n === 0) n = parseInt(a.hex, 16) - parseInt(b.hex, 16);
        return n;
    });
    return list;
}

//打开珠子搜索面板
function openDecoSearch(partIdx, idx, el) {
    let $el = $(el);
    //禁用的输入框（无孔）不响应
    if ($el.attr("disabled") !== undefined) return;
    //从 data-slot 读取最大可插孔位
    let maxSlot = parseInt($el.attr("data-slot") || "0");
    if (!maxSlot) return;
    DecoSearchInfo = { partIdx: partIdx, idx: idx, el: el, maxSlot: maxSlot };
    ArmorSearchMode = "deco";
    ArmorSearchPartIdx = null;
    $("#armorSearchModalLabel").text("选择珠子 · 孔位【" + maxSlot + "】");
    $("#armorSearchInput").attr("placeholder", "输入珠子名 / 技能名搜索…").val("");
    $("#armorSearchClear").removeClass("d-none").text("清除珠子");
    $("#armorSearchNone").addClass("d-none");
    $("#charmSearchConfirm").addClass("d-none");
    renderDecoSearchList("");
    if (window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).show();
    }
    if (!isTouchDevice()) {
        setTimeout(function () {
            let inp = document.getElementById("armorSearchInput");
            if (inp) inp.focus();
        }, 300);
    }
}

//渲染珠子搜索列表
function renderDecoSearchList(keyword) {
    if (!DecoSearchInfo) return;
    let list = buildDecoSearchList(DecoSearchInfo.maxSlot);
    let kw = (keyword || "").trim().toLowerCase();
    let curVal = $(DecoSearchInfo.el).val() || "";
    let html = "";
    let shown = 0;
    for (let i = 0; i < list.length; i++) {
        let d = list[i];
        if (kw) {
            let nameHit = d.dname.toLowerCase().indexOf(kw) >= 0;
            let skillHit = d.skill && d.skill.toLowerCase().indexOf(kw) >= 0;
            if (!nameHit && !skillHit) continue;
        }
        shown++;
        if (shown > 200) break;
        let active = (d.dname === curVal) ? " active" : "";
        let skStr = d.skill ? d.skill : "（无对应技能）";
        html += `<button type="button" class="armor-search-item${active}" data-id="${d.dname}">
            <div class="asi-main">
                <span class="asi-name">${d.dname}</span>
                <span class="asi-badges">
                    <span class="asi-badge">孔${d.slot}</span>
                    <span class="asi-badge">Lv${d.lv}</span>
                </span>
            </div>
            <div class="asi-skills">${skStr}</div>
        </button>`;
    }
    if (!shown) {
        html = `<div class="armor-search-empty">没有找到匹配的珠子</div>`;
    }
    updateSearchCount($("#armorSearchCount"), shown, "颗珠子");
    document.getElementById("armorSearchList").innerHTML = html;
}

//从搜索面板选中珠子
function selectDecoFromSearch(dname) {
    if (!dname || !DecoSearchInfo) return;
    let el = DecoSearchInfo.el;
    $(el).val(dname);
    //触发原有解析逻辑（走 dname 分支）
    onInputDecoration(el, dname);
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
}
//清除该珠子
function clearDecoFromSearch() {
    if (!DecoSearchInfo) return;
    let el = DecoSearchInfo.el;
    $(el).val("");
    onInputDecoration(el, "");
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
}

// ===== 词条搜索面板 =====
//当前正在选择的词条信息
var KSkillSearchInfo = null;   // {partIdx, idx, el}

//打开词条搜索面板
function openKSkillSearch(partIdx, idx, el) {
    if (partIdx == null || idx == null) return;
    let $el = $(el);
    KSkillSearchInfo = { partIdx: partIdx, idx: idx, el: el };
    ArmorSearchMode = "kskill";
    ArmorSearchPartIdx = null;
    $("#armorSearchModalLabel").text("选择词条 · 位置" + partIdx);
    $("#armorSearchInput").attr("placeholder", "输入词条名搜索…（如 技能 / 防御 / 孔位）").val("");
    $("#armorSearchClear").addClass("d-none");
    $("#armorSearchNone").removeClass("d-none");
    $("#charmSearchConfirm").addClass("d-none");
    renderKSkillSearchList("");
    if (window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).show();
    }
    if (!isTouchDevice()) {
        setTimeout(function () {
            let inp = document.getElementById("armorSearchInput");
            if (inp) inp.focus();
        }, 300);
    }
}

//渲染词条搜索列表
function renderKSkillSearchList(keyword) {
    if (!KSkillSearchInfo) return;
    let tb = $(".k_skill_tbody_" + KSkillSearchInfo.partIdx);
    let sel = tb.find("tr").eq(parseInt(KSkillSearchInfo.idx)).find(".k_skill_select");
    //读取当前 select 的所有选项（第0个是 "-----"）
    let opts = sel.find("option");
    let curVal = sel.val();
    let kw = (keyword || "").trim().toLowerCase();
    //先收集所有词条
    let arr = [];
    for (let i = 0; i < opts.length; i++) {
        let o = opts.eq(i);
        let val = o.val();
        if (val === undefined || /_00_0$/.test(val)) continue; //跳过"-----"
        let txt = o.text();
        let parts = txt.split(":");
        let name = parts[0];
        let costTxt = parts[1] || "";
        let costNum = parseInt(costTxt.replace("+", ""), 10) || 0;
        arr.push({ val: val, name: name, cost: costNum });
    }
    //常用词条优先排序
    arr = sortKSkillByCommon(arr);
    let html = "";
    let shown = 0;
    for (let i = 0; i < arr.length; i++) {
        let d = arr[i];
        if (kw && d.name.toLowerCase().indexOf(kw) < 0 && (":" + d.cost).indexOf(kw) < 0) continue;
        shown++;
        if (shown > 200) break;
        //颜色：正 cost（扣点）红、负 cost（加点）绿、0 灰
        let costCls = d.cost > 0 ? "kskill-cost-pos" : (d.cost < 0 ? "kskill-cost-neg" : "");
        //词条类型标签
        let typeCls = "kskill-type-other";
        if (d.name.indexOf("防御") >= 0) typeCls = "kskill-type-def";
        else if (d.name.indexOf("耐性") >= 0) typeCls = "kskill-type-res";
        else if (d.name.indexOf("孔位") >= 0) typeCls = "kskill-type-slot";
        else if (d.name.indexOf("技能") >= 0) typeCls = "kskill-type-skill";
        let active = (d.val === curVal) ? " active" : "";
        //技能+1 显示等级徽章（S/A/B/C/D）
        let gradeHtml = "";
        if (d.name === "技能+1") {
            let g = kSkillPlusGrade(d.cost);
            if (g) gradeHtml = `<span class="kskill-grade kskill-grade-${g}">${g}</span>`;
        }
        html += `<button type="button" class="armor-search-item${active}" data-val="${d.val}">
            <div class="asi-main">
                <span class="asi-name"><span class="kskill-tag ${typeCls}"></span>${d.name}${gradeHtml}</span>
                <span class="asi-badges">
                    <span class="asi-badge ${costCls}">点数 ${d.cost > 0 ? "+" + d.cost : d.cost}</span>
                </span>
            </div>
        </button>`;
    }
    if (!shown) {
        html = `<div class="armor-search-empty">没有找到匹配的词条</div>`;
    }
    updateSearchCount($("#armorSearchCount"), shown, "条词条");
    document.getElementById("armorSearchList").innerHTML = html;
}

//技能+1 的等级映射：cost(绝对值) => 等级
//15=S, 12=A, 9=B, 6=C, 3=D
function kSkillPlusGrade(cost) {
    let c = Math.abs(cost);
    let map = { 15: "S", 12: "A", 9: "B", 6: "C", 3: "D" };
    return map[c] || "";
}

//常用词条排序：置顶顺序 防御-12 > 技能-1 > 技能+1(S A B C D) > 孔位+1/2/3 > 防御-6，其余保持原顺序
function sortKSkillByCommon(arr) {
    //置顶优先级表：返回 rank（越小越前）；-1 表示不置顶
    function rank(d) {
        if (d.name === "防御-12") return 0;
        if (d.name === "技能-1") return 1;
        //技能+1 按等级 S,A,B,C,D（cost 15,12,9,6,3；内部为 -15,-12,-9,-6,-3）
        if (d.name === "技能+1") {
            let order = [-15, -12, -9, -6, -3];
            let idx = order.indexOf(d.cost);
            if (idx >= 0) return 2 + idx; //2..6
        }
        if (d.name === "孔位+1") return 7;
        if (d.name === "孔位+2") return 8;
        if (d.name === "孔位+3") return 9;
        if (d.name === "防御-6") return 10;
        return -1;
    }
    let pinned = [];
    let rest = [];
    for (let i = 0; i < arr.length; i++) {
        let r = rank(arr[i]);
        if (r >= 0) {
            pinned.push({ item: arr[i], rank: r, idx: i });
        } else {
            rest.push(arr[i]);
        }
    }
    pinned.sort(function (a, b) {
        if (a.rank !== b.rank) return a.rank - b.rank;
        return a.idx - b.idx;
    });
    let result = [];
    for (let i = 0; i < pinned.length; i++) result.push(pinned[i].item);
    for (let i = 0; i < rest.length; i++) result.push(rest[i]);
    return result;
}

// ===== 技能搜索面板 =====
//当前正在选择的技能信息
var SkillSearchInfo = null;   // {partIdx, idx, el}

//打开技能搜索面板（仅当该行有可选技能时）
function openSkillSearch(partIdx, idx, el) {
    if (partIdx == null || idx == null) return;
    let $el = $(el);
    if ($el.prop("disabled")) return;
    let tr = $(".k_skill_tbody_" + partIdx).find("tr").eq(parseInt(idx));
    let sel = tr.find(".k_skill_change");
    let validCount = 0;
    sel.find("option").each(function () {
        let v = $(this).val();
        if (v) {
            let hex = String(v).split("_")[2];
            if (hex && hex !== "00") validCount++;
        }
    });
    if (validCount === 0) return;
    SkillSearchInfo = { partIdx: partIdx, idx: idx, el: el };
    ArmorSearchMode = "skill";
    ArmorSearchPartIdx = null;
    $("#armorSearchModalLabel").text("选择技能 · 位置" + partIdx);
    $("#armorSearchInput").attr("placeholder", "输入技能名搜索…").val("");
    $("#armorSearchClear").addClass("d-none");
    $("#armorSearchNone").removeClass("d-none").text("不设置技能");
    $("#charmSearchConfirm").addClass("d-none");
    renderSkillSearchList("");
    if (window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).show();
    }
    if (!isTouchDevice()) {
        setTimeout(function () {
            let inp = document.getElementById("armorSearchInput");
            if (inp) inp.focus();
        }, 300);
    }
}

// cost 值 → 词条 hex（技能+1 的 5 档）
var CostToSkillHex = { 3: "90", 6: "91", 9: "92", 12: "93", 15: "94" };

//渲染技能搜索列表
// 词条=技能+X 时：列出所有"技能+1"可加的技能（全等级），当前等级排最前
// 词条=技能-1 时：只列出装备自带的技能（沿用原逻辑）
function renderSkillSearchList(keyword) {
    if (!SkillSearchInfo) return;
    let tr = $(".k_skill_tbody_" + SkillSearchInfo.partIdx).find("tr").eq(parseInt(SkillSearchInfo.idx));
    let ksel = tr.find(".k_skill_select");       // 词条 select
    let sel = tr.find(".k_skill_change");         // 技能 select
    let curSkillVal = sel.val();
    let kw = (keyword || "").trim().toLowerCase();

    //当前词条 hex / cost
    let kVal = ksel.val() || "";
    let kParts = String(kVal).split("_");
    let curKHex = kParts[2];
    let curCost = 0;
    if (kParts.length >= 4) curCost = Math.abs(parseInt(kParts[3], 10)) || 0;

    let list = [];

    if (curKHex === "95") {
        //技能-1：装备自带技能排最前，其余所有技能跟在后面（特殊用途）
        let selfHex = {};
        sel.find("option").each(function () {
            let val = $(this).val();
            if (!val) return;
            let hex = String(val).split("_")[2];
            if (!hex || hex === "00") return;
            let txt = ($(this).text() || "").trim();
            selfHex[hex] = true;
            let sd = skill_data[hex];
            list.push({ hex: hex, val: val, name: txt, cost: 0, max: (sd ? sd["max"] : 0), isSelf: true });
        });
        //再补充所有技能（除自带外）
        for (let hex in skill_data) {
            let sd = skill_data[hex];
            if (!sd) continue;
            if (selfHex[hex]) continue;
            let thisVal = SkillSearchInfo.partIdx + "_" + SkillSearchInfo.idx + "_" + hex;
            list.push({ hex: hex, val: thisVal, name: sd["sname"], cost: 0, max: sd["max"], isSelf: false });
        }
    } else {
        //技能+X：列出所有 5 档技能，当前等级优先
        for (let hex in skill_data) {
            let sd = skill_data[hex];
            if (!sd) continue;
            let c = sd["cost"];
            if (!CostToSkillHex[c]) continue;
            let thisVal = SkillSearchInfo.partIdx + "_" + SkillSearchInfo.idx + "_" + hex;
            list.push({ hex: hex, val: thisVal, name: sd["sname"], cost: c, max: sd["max"], isSelf: false });
        }
        list.sort(function (a, b) {
            let aCur = (a.cost === curCost) ? 0 : 1;
            let bCur = (b.cost === curCost) ? 0 : 1;
            if (aCur !== bCur) return aCur - bCur;
            if (a.cost !== b.cost) return b.cost - a.cost;
            return parseInt(a.hex, 16) - parseInt(b.hex, 16);
        });
    }

    //有关键词时：名称完全匹配优先，其次名称更短的优先，再按原顺序
    if (kw) {
        list.sort(function (a, b) {
            let an = a.name.toLowerCase(), bn = b.name.toLowerCase();
            let aExact = (an === kw) ? 0 : 1;
            let bExact = (bn === kw) ? 0 : 1;
            if (aExact !== bExact) return aExact - bExact;
            if (an.length !== bn.length) return an.length - bn.length;
            return an.indexOf(kw) - bn.indexOf(kw);
        });
    }

    let html = "";
    let shown = 0;
    for (let i = 0; i < list.length; i++) {
        let d = list[i];
        if (kw && d.name.toLowerCase().indexOf(kw) < 0) continue;
        shown++;
        if (shown > 300) break;
        let active = (d.val === curSkillVal) ? " active" : "";
        //等级徽章（仅技能+1 时显示 S/A/B/C/D）
        let gradeHtml = "";
        let isCur = false;
        if (!d.isSelf) {
            let grade = kSkillPlusGrade(d.cost);
            if (grade) gradeHtml = `<span class="kskill-grade kskill-grade-${grade}">${grade}</span>`;
            isCur = (d.cost === curCost);
        }
        //名字后缀：自带技能标注"自带"（用浅色小字，不占右侧徽章位）
        let nameSuffix = "";
        if (d.isSelf) {
            nameSuffix = ` <span class="skill-self-tag">自带</span>`;
        }
        //右侧徽章：统一显示 Lv上限（自带与非自带都显示）
        let badgeHtml = "";
        if (d.max) {
            badgeHtml = `<span class="asi-badge">上限${d.max}</span>`;
        } else if (d.extra) {
            badgeHtml = `<span class="asi-badge">${d.extra.trim()}</span>`;
        }
        html += `<button type="button" class="armor-search-item${active}${isCur ? " skill-cur-grade" : ""}" data-val="${d.val}">
            <div class="asi-main">
                <span class="asi-name"><span class="kskill-tag kskill-type-skill"></span>${d.name}${gradeHtml}${nameSuffix}</span>
                <span class="asi-badges">
                    ${badgeHtml}
                </span>
            </div>
        </button>`;
    }
    if (!shown) {
        html = `<div class="armor-search-empty">没有找到匹配的技能</div>`;
    }
    updateSearchCount($("#armorSearchCount"), shown, "个技能");
    document.getElementById("armorSearchList").innerHTML = html;
}

//从面板选中技能：若技能等级与当前词条不同，则自动切换左边词条为对应等级
function selectSkillFromSearch(val) {
    if (!SkillSearchInfo) return;
    let partIdx = SkillSearchInfo.partIdx;
    let idx = SkillSearchInfo.idx;
    let tr = $(".k_skill_tbody_" + partIdx).find("tr").eq(parseInt(idx));
    let ksel = tr.find(".k_skill_select");
    let sel = tr.find(".k_skill_change");

    if (val === "__none__") {
        //复位到占位选项
        sel.find("option").each(function () {
            let v = $(this).val();
            if (v) {
                let hex = String(v).split("_")[2];
                if (!hex || hex === "00") { sel.val(v); return false; }
            }
        });
        sel.trigger("change");
        if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
        return;
    }

    //解析目标技能 hex
    let parts = String(val).split("_");
    let targetHex = parts[2];

    //当前词条 hex 与 cost
    let kVal = ksel.val() || "";
    let kParts = String(kVal).split("_");
    let curKHex = kParts[2];
    let curCost = 0;
    if (kParts.length >= 4) curCost = Math.abs(parseInt(kParts[3], 10)) || 0;

    //"技能-1"：从装备自带技能里减，不涉及等级切换，直接选中
    if (curKHex === "95") {
        //确保技能列存在该选项（"技能-1"把所有技能都列出来了，装备没有的技能需动态补上）
        if (sel.find("option[value='" + val + "']").length === 0) {
            let opt = document.createElement("option");
            opt.value = val;
            if (skill_data[targetHex]) {
                opt.text = skill_data[targetHex]["sname"];
            }
            sel.append(opt);
        }
        sel.val(val);
        sel.trigger("change");
        if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
        return;
    }

    //"技能+X"：按目标技能的等级，自动切换词条等级
    let targetCost = 0;
    if (skill_data[targetHex]) targetCost = skill_data[targetHex]["cost"];
    let targetKHex = CostToSkillHex[targetCost];

    //若技能等级与当前词条等级不同 → 先把词条切到对应等级（重建技能列选项）
    if (targetKHex && targetKHex !== curKHex) {
        //找到词条 select 里对应 hex 的选项
        let targetKVal = null;
        ksel.find("option").each(function () {
            let v = $(this).val();
            if (!v) return;
            let p = String(v).split("_");
            if (p[2] === targetKHex) { targetKVal = v; return false; }
        });
        if (targetKVal == null) {
            //当前装备词条池里没有该等级词条，放弃（理论上不会发生）
            if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
            return;
        }
        ksel.val(targetKVal);
        ksel.trigger("change");   //重建技能列选项 + 同步词条显示框
    }

    //现在技能列应已重建，选中目标技能
    let finalVal = partIdx + "_" + idx + "_" + targetHex;
    //确保选项存在
    if (sel.find("option[value='" + finalVal + "']").length === 0) {
        let opt = document.createElement("option");
        opt.value = finalVal;
        if (skill_data[targetHex]) opt.text = skill_data[targetHex]["sname"];
        sel.append(opt);
    }
    sel.val(finalVal);
    sel.trigger("change");
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
}

// ===== 护石技能搜索面板 =====
//当前正在选择的护石技能信息：{which:"1"|"2"}
var CharmSearchInfo = null;
//当前在面板里"选中"的技能 hex（用于显示等级行）
var CharmSearchPickedHex = null;

//打开护石技能搜索面板
function openCharmSearch(which) {
    if (which !== "1" && which !== "2") return;
    CharmSearchInfo = { which: which };
    ArmorSearchMode = "charm";
    ArmorSearchPartIdx = null;
    $("#armorSearchModalLabel").text("选择护石技能" + which);
    $("#armorSearchInput").attr("placeholder", "输入技能名搜索…").val("");
    $("#armorSearchClear").addClass("d-none");
    $("#armorSearchNone").removeClass("d-none").text("不设置技能");
    //"确认选择"：选完技能+等级后才启用
    $("#charmSearchConfirm").addClass("d-none");
    $("#charmLevelRow").addClass("d-none");
    CharmSearchPickedHex = null;
    renderCharmSearchList("");
    if (window.bootstrap) {
        bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).show();
    }
    if (!isTouchDevice()) {
        setTimeout(function () {
            let inp = document.getElementById("armorSearchInput");
            if (inp) inp.focus();
        }, 300);
    }
}

//渲染护石技能搜索列表
function renderCharmSearchList(keyword) {
    if (!CharmSearchInfo) return;
    let which = CharmSearchInfo.which;
    //护石技能池：从当前数据取（sel1 / sel2）
    let pool = CurData.charmData && CurData.charmData[which === "1" ? "sel1" : "sel2"] || [];
    let kw = (keyword || "").trim().toLowerCase();
    //当前选中的 hex
    let curHex = which === "1" ? CurData.charmData["skill1Hex"] : CurData.charmData["skill2Hex"];
    if (!curHex) curHex = "00";
    let isExtreme = isExtremeMode;

    let html = "";
    let shown = 0;
    for (let i = 0; i < pool.length; i++) {
        let d = pool[i];
        let name = d["sname"] || "";
        if (kw && name.toLowerCase().indexOf(kw) < 0) continue;
        shown++;
        if (shown > 300) break;
        let maxLv = which === "1" ? d["p1Max"] : d["p2Max"];
        if (isExtreme) maxLv = 15;
        let active = (d["hex"] === curHex) ? " active" : "";
        let picked = (d["hex"] === CharmSearchPickedHex) ? " charm-picked" : "";
        html += `<button type="button" class="armor-search-item${active}${picked}" data-hex="${d["hex"]}" data-max="${maxLv}">
            <div class="asi-main">
                <span class="asi-name">${name}</span>
                <span class="asi-badges">
                    <span class="asi-badge">上限${maxLv}</span>
                </span>
            </div>
        </button>`;
    }
    if (!shown) {
        html = `<div class="armor-search-empty">没有找到匹配的技能</div>`;
    }
    updateSearchCount($("#armorSearchCount"), shown, "个技能");
    document.getElementById("armorSearchList").innerHTML = html;
}

//点击护石技能名 → 选中该技能（显示等级行）
function pickCharmSkill(hex, maxLv, el) {
    CharmSearchPickedHex = hex;
    //高亮当前项
    $("#armorSearchList .armor-search-item").removeClass("charm-picked");
    if (el) $(el).addClass("charm-picked");
    //构建等级下拉 1..maxLv
    let max = parseInt(maxLv, 10) || 1;
    let opts = "";
    for (let lv = 1; lv <= max; lv++) {
        opts += `<option value="${lv}">Lv${lv}</option>`;
    }
    $("#charmLevelSelect").html(opts);
    //默认等级：若是当前已选技能，取当前等级；否则取最大值
    let defLv = max;
    if (CharmSearchInfo) {
        let which = CharmSearchInfo.which;
        let curH = which === "1" ? CurData.charmData["skill1Hex"] : CurData.charmData["skill2Hex"];
        let curL = which === "1" ? CurData.charmData["skill1Lv"] : CurData.charmData["skill2Lv"];
        if (curH === hex && curL > 0) defLv = Math.min(curL, max);
    }
    $("#charmLevelSelect").val(String(defLv));
    $("#charmLevelRow").removeClass("d-none").addClass("d-flex");
    //显示"确认选择"按钮（此时才允许确认）
    $("#charmSearchConfirm").removeClass("d-none");
}

//确认选择护石技能（点"确认选择"按钮时应用）
function selectCharmFromSearch(hex, lv) {
    if (!CharmSearchInfo || !hex) return;
    let which = CharmSearchInfo.which;
    let selId = "#charm_skill_select" + which;
    let $sel = $(selId);
    if (!$sel.length) return;
    //在（隐藏的）select 里找到该 hex 的 option，取其 value（格式：which_lvType_hex_maxLv）
    let targetVal = null;
    let lvType = "A";
    $sel.find("option").each(function () {
        let v = $(this).val();
        if (!v) return;
        let r = String(v).split("_");
        if (r[2] === hex) {
            targetVal = v;
            lvType = r[1] || "A";
            return false;
        }
    });
    //若 select 里没有这个 hex（极限模式下技能池可能不含），动态补一个 option
    if (!targetVal) {
        let sd = skill_data[hex];
        lvType = sd && sd["lvType"] ? sd["lvType"] : "A";
        targetVal = which + "_" + lvType + "_" + hex + "_" + lv;
        let opt = document.createElement("option");
        opt.value = targetVal;
        opt.text = (sd ? sd["sname"] : hex);
        $sel.append(opt);
    }
    //选中该 option（用原始 value，不改动它，避免选不中）
    $sel.val(targetVal);
    //把用户选的等级直接写入数据 + 同步 select 的显示文本
    lv = parseInt(lv, 10) || 0;
    if (lv < 1) lv = 1;
    if (which === "1") {
        CurData.charmData["skill1Hex"] = hex;
        CurData.charmData["skill1Lv"] = lv;
        CurData.charmData["skill1Type"] = lvType;
    } else {
        CurData.charmData["skill2Hex"] = hex;
        CurData.charmData["skill2Lv"] = lv;
        CurData.charmData["skill2Type"] = lvType;
    }
    //更新 option 文本为实际选择的等级（保持 and 显示一致）
    let sd = skill_data[hex];
    let sname = (sd ? sd["sname"] : hex);
    $sel.find("option[value='" + targetVal + "']").text(sname + " " + lv);
    //刷新孔位（护石技能类型变了会影响可选孔位）与总表
    initCharmSlotSel();
    refreshShowArmorData();
    syncCharmDisplay(which);
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
    $("#charmLevelRow").addClass("d-none").removeClass("d-flex");
    $("#charmSearchConfirm").addClass("d-none");
    CharmSearchPickedHex = null;
}

//同步护石技能的只读显示框（从隐藏 select 的当前选中项文本取）
function syncCharmDisplay(which) {
    let $sel = $("#charm_skill_select" + which);
    let $disp = $("#charm_skill_display" + which);
    if (!$sel.length || !$disp.length) return;
    let txt = $sel.find("option:selected").text() || "";
    if (txt === "-----" || !txt) {
        $disp.val("");
    } else {
        $disp.val(txt);
    }
}

//清除护石技能（面板"不设置技能"）
function clearCharmFromSearch() {
    if (!CharmSearchInfo) return;
    let which = CharmSearchInfo.which;
    let $sel = $("#charm_skill_select" + which);
    //选中占位项（第一个 option）
    $sel.val($sel.find("option").eq(0).val());
    $sel.trigger("change");
    syncCharmDisplay(which);
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
    $("#charmLevelRow").addClass("d-none").removeClass("d-flex");
    $("#charmSearchConfirm").addClass("d-none");
    CharmSearchPickedHex = null;
}

//从面板选中词条
function selectKSkillFromSearch(val) {
    if (!val || !KSkillSearchInfo) return;
    let tb = $(".k_skill_tbody_" + KSkillSearchInfo.partIdx);
    let sel = tb.find("tr").eq(parseInt(KSkillSearchInfo.idx)).find(".k_skill_select");
    let disp = tb.find("tr").eq(parseInt(KSkillSearchInfo.idx)).find(".k_skill_display");
    if (val === "__none__") {
        sel.val("-----");
        if (sel.val() !== "-----") {
            //当前 select 可能没有 "-----" 的合法 value，取第一个含 _00_0 的
            sel.find("option").each(function () {
                if (/_00_0$/.test($(this).val())) { sel.val($(this).val()); return false; }
            });
        }
        disp.val("");
        sel.trigger("change");
    } else {
        sel.val(val);
        let txt = sel.find("option[value='" + val + "']").text();
        disp.val(txt.split(":")[0] || "");
        sel.trigger("change");
    }
    if (window.bootstrap) bootstrap.Modal.getOrCreateInstance(document.getElementById("armorSearchModal")).hide();
}


function initKSkillSelect(partIdx, armor_id) {
    let tb = $(".k_skill_tbody_" + partIdx);
    //风雷没有加减技能
    let isWT = ["336", "334"].includes(armor_id.split("_")[0]);
    if (tb) {
        let tr = tb.find("tr");
        for (let i = 0; i < tr.length; i++) {
            //词条选择
            let sel = $(tr[i]).find("td").eq(0).find(".k_skill_select");
            sel.html(`<option value="${partIdx}_${i}_00_0">-----</option>`);
            let skillPool = getSkillAddByArmorId(armor_id);
            let count = 0;
            for (let j in skillPool) {
                let skData = skillPool[j];
                count++;
                let opt = document.createElement("option");
                opt.value = partIdx + "_" + i + "_" + skData["hex"] + "_" + skData["cost"];
                opt.text = skData["name"] + ":" + (skData["cost"] > 0 ? "-" : "+") + Math.abs((skData["cost"]));
                sel.append(opt);
                if (skData["cost"] > 0) {
                    sel.find("option").eq(count).css("color", "red");
                } else {
                    sel.find("option").eq(count).css("color", "green");
                }

            }
            //同步只读显示框
            let disp = $(tr[i]).find("td").eq(0).find(".k_skill_display");
            let dispTxt = sel.find("option:selected").text() || "";
            if (dispTxt == "-----" || !dispTxt) {
                disp.val("");
            } else {
                let dname = dispTxt.split(":")[0];
                let dcostTxt = dispTxt.split(":")[1] || "";
                if (dcostTxt) {
                    let dcost = parseInt(dcostTxt.replace("+", ""), 10) || 0;
                    disp.val(dname + "（" + (dcost > 0 ? "+" + dcost : dcost) + "）");
                } else {
                    disp.val(dname);
                }
            }

            //初始化上次选择的减技能，增技能的内容
            clearOldNewSkillSel(partIdx, i);
            //同步技能列显示框
            syncSkillChangeDisplay(partIdx, i);

        }
    }
}
function onSelectArmor(armor_id) {
    if (armor_id == "-----" || !armor_id) {
        //清空数据
        let p = (armor_id && armor_id != "-----") ? armor_id.split("_")[1] : null;
        if (p) {
            CurData.partMap[p] = null;
        }
        return;
    }

    let partIdx = armor_id.split("_")[1];

    let data = CurData.partMap[partIdx];
    if (!data || (data["eq_id"] != armor_id)) {
        data = createPartData(partIdx, armor_id);
    }
    if (!data) {
        //装备数据不存在（如旧缓存的装备id已失效），忽略避免报错
        return;
    }
    CurData.partMap[partIdx] = data;
    initKSkillSelect(partIdx, armor_id);
    initDecorationSel(partIdx);
    refreshShowArmorData();

}
function clearOldNewSkillSel(partIdx, idx) {
    idx = parseInt(idx);
    let v = `${partIdx}_${idx}_00_0`;
    $(".k_skill_tbody_" + partIdx).find("tr").eq(idx).find(".k_skill_change").html(`<option value="${v}">-----</option>`)

}

//同步技能列只读显示框：根据 .k_skill_change 的选项状态更新显示框（是否有可选项、当前值）
function syncSkillChangeDisplay(partIdx, idx) {
    let tr = $(".k_skill_tbody_" + partIdx).find("tr").eq(parseInt(idx));
    let sel = tr.find(".k_skill_change");
    let disp = tr.find(".k_skill_change_display");
    if (!disp.length) return;
    //统计有效选项（排除 "-----"）
    function isEmptyVal(v) {
        if (!v) return true;
        let parts = String(v).split("_");
        // "1_0_00_0" 或 "1_0_00" → hex 段为 "00"
        let hex = parts[2];
        return (!hex || hex === "00");
    }
    let validCount = 0;
    sel.find("option").each(function () {
        if (!isEmptyVal($(this).val())) validCount++;
    });
    if (validCount === 0) {
        //没有可选项（如防御/孔位/耐性词条）→ 禁用
        disp.prop("disabled", true);
        disp.val("");
        disp.attr("placeholder", "—");
    } else {
        disp.prop("disabled", false);
        //占位统一为"—"：与不可选状态保持一致，避免"选择技能…"/"—"两种样式来回变
        disp.attr("placeholder", "—");
        let v = sel.val();
        if (!isEmptyVal(v)) {
            let txt = (sel.find("option:selected").text() || "").trim();
            disp.val(txt);
        } else {
            disp.val("");
        }
    }
}
//选择怪异选项
function onSelectKSkill(value) {
    //idx 0-6
    let t_values = value.split('_');//event.target.value.split('_');
    let partIdx = t_values[0];
    let idx = t_values[1];
    let k_skill_hex = t_values[2];
    let k_skill_cost = parseInt(t_values[3]);

    //该位置没有装备（数据为空）时，忽略词条变更，避免清空/切换配装过程中的残留 change 报错
    if (!CurData.partMap[partIdx]) {
        return;
    }

    clearOldNewSkillSel(partIdx, idx);
    //同步词条只读显示框（任何来源的 change 都经过这里）
    (function () {
        let tr = $(".k_skill_tbody_" + partIdx).find("tr").eq(parseInt(idx));
        let ksel = tr.find(".k_skill_select");
        let disp = tr.find(".k_skill_display");
        let txt = (ksel.find("option:selected").text() || "").trim();
        let val = ksel.val();
        //无词条：文本是 "-----" 或 hex 段为 00
        let isEmpty = (!val) || (val === "-----") || (txt === "-----") || (/_00_0$/.test(val));
        if (isEmpty) {
            disp.val("");
        } else {
            //文本形如 "技能+1:-15"，把点数一起显示：技能+1（-15）
            let name = txt.split(":")[0];
            let costTxt = txt.split(":")[1] || "";
            if (costTxt) {
                let costNum = parseInt(costTxt.replace("+", ""), 10) || 0;
                disp.val(name + "（" + (costNum > 0 ? "+" + costNum : costNum) + "）");
            } else {
                disp.val(name);
            }
        }
    })();
    let skillSel = $(".k_skill_tbody_" + partIdx).find("tr").eq(parseInt(idx)).find(".k_skill_change");
    let partData = CurData.partMap[partIdx];
    let type = "";
    let type_def = 0;
    if (k_skill_hex == "00") {
        //没有选项
    } else if (k_skill_hex == "95") {
        //减技能 增加可用点数
        type = "skill";
        let skm = partData["eq_skill"];
        for (let x in skm) {
            let d = skm[x];
            let sname = d["sname"];
            let slv = d["lv"];
            let skill_hex = d["hex"];
            let opt = document.createElement("option");
            opt.text = sname + " Lv: " + (slv ? slv : 1);
            opt.value = `${partIdx}_${idx}_${skill_hex}`;
            skillSel.append(opt);
        }
    } else if (["90", "91", "92", "93", "94"].includes(k_skill_hex)) {
        type = "skill";
        //增加技能 消耗点数        
        let cost_skill_list = getAddSkillListByCost(k_skill_cost);

        for (let j in cost_skill_list) {
            let d = cost_skill_list[j];

            let opt = document.createElement("option")
            let sname = d["sname"];
            let skill_hex = d["hex"];
            opt.value = `${partIdx}_${idx}_${skill_hex}`;
            opt.text = sname;
            skillSel.append(opt);
        }

    } else if (["8B", "8C", "8D"].includes(k_skill_hex)) {
        type = "slot";
    } else if (["45", "49", "4A", "4B", "4C", "3B", "3C", "46", "47", "48"].includes(k_skill_hex)) {
        //防御9-18-27-36
        if (["49", "4A", "4B", "4C"].includes(k_skill_hex)) {
            type_def = 2;
        }
        type = "def";
    } else {
        //耐性+ 1
        type = "def";
        if (k_skill_cost > 0) {
            type_def = 1;
        }
    }

    if (k_skill_cost > 0) {
        $(".k_skill_tbody_" + partIdx).find("tr").eq(parseInt(idx)).find(".k_skill_select").css("color", "red");
    } else {
        $(".k_skill_tbody_" + partIdx).find("tr").eq(parseInt(idx)).find(".k_skill_select").css("color", "green");
    }
    //该选项的hex 变更的技能编码 以及花费
    partData["k_skill"][idx]["k_skill_hex"] = k_skill_hex;
    partData["k_skill"][idx]["k_skill_edit_hex"] = "00";//变更的技能编码 +-一样 没选择技能时默认没有
    partData["k_skill"][idx]["k_skill_cost"] = k_skill_cost;
    partData["k_skill"][idx]["type"] = type;
    partData["k_skill"][idx]["type_def"] = type_def;


    //增加孔位 消耗点数      
    //对应增加的孔位
    let hnM = {
        "8B": 1, "8C": 2, "8D": 3
    }

    //重置数据
    partData["eq_k_slot"] = partData["eq_slot"];
    partData["eq_k_def"] = JSON.parse(JSON.stringify(partData["eq_def"]));
    partData["eq_k_skill"] = JSON.parse(JSON.stringify(partData["eq_skill"]));
    partData["eq_k_cost"] = partData["eq_cost"];

    //检查所有选项 计算孔位防御耐性
    let slotValue = 0;
    for (let i = 0; i < 7; i++) {
        let p = partData["k_skill"][i];
        let pHex = p["k_skill_hex"];
        let curType = p.type;
        if (["def"].includes(curType)) {
            let [key, value] = getDefStatusByPoolAndHex(partData.eq_pool_id, pHex);
            if (key) {
                partData["eq_k_def"][key] = partData["eq_k_def"][key] + value;
            }
        } else if (curType == "slot") {
            slotValue = slotValue + (hnM[pHex] || 0);
        } else if (curType == "skill") {


        }

        partData["eq_k_cost"] = partData["eq_k_cost"] - p["k_skill_cost"];
    }

    //在原装备上进行加减孔 用于显示
    if (slotValue > 0) {
        let v = slotValue;
        let k_slot_simple = partData["eq_slot"].split("").map(str => Number(str));
        for (let i = 0; i < 3; i++) {
            if (v > 0 && k_slot_simple[i] == 0) {
                k_slot_simple[i] = 1;
                v--;
            }
        }
        for (let i = 0; i < 3; i++) {
            if (v > 0 && k_slot_simple[i] < 4) {
                let tmp = k_slot_simple[i];
                if ((tmp + v) > 4) {
                    k_slot_simple[i] = 4;
                    v = tmp + v - 4;
                } else {
                    k_slot_simple[i] = tmp + v;
                    v = 0;
                }
            }
        }
        partData["eq_k_slot"] = k_slot_simple.join("");
    }
    initDecorationSel(partIdx);
    //加减技能 这里还没有选具体的选项 应当重新计算所有选项 并且选择技能后 重复该操作
    setToPartDataSkillsChange(partIdx);
    //同步技能列显示框
    syncSkillChangeDisplay(partIdx, idx);

    refreshShowArmorData();
}


function onSelectChangeSkill(value) {
    //选择增加技能 或者 减去旧技能
    let r = value.split("_");
    let partIdx = r[0], idx = parseInt(r[1]), hex = r[2];
    //该位置没有装备或还没有词条数据时，忽略（避免清空/切换配装时残留 change 报错）
    let pd = CurData.partMap[partIdx];
    if (!pd || !pd["k_skill"] || !pd["k_skill"][idx]) {
        return;
    }
    pd["k_skill"][idx]["k_skill_edit_hex"] = hex;
    syncSkillChangeDisplay(partIdx, idx);
    setToPartDataSkillsChange(partIdx);
    refreshShowArmorData();
}

//按护石技能hex选中下拉项(忽略缓存中可能不一致的等级，如极限模式的15级)
function selectCharmSkillOption(selId, prefix, hex) {
    let elm = $(selId);
    //技能为空或无效时，回到占位项
    if (!hex || hex == "00") {
        elm.val(elm.find("option").eq(0).val());
        elm.change();
        return;
    }
    let opts = elm.find("option");
    let targetVal = null;
    for (let i = 0; i < opts.length; i++) {
        let ov = opts.eq(i).val();
        if (ov == null) continue;
        let r = String(ov).split("_");
        if (r[0] == prefix && r[2] == hex) {
            targetVal = ov;
            break;
        }
    }
    if (targetVal != null) {
        elm.val(targetVal);
    } else {
        //当前模式列表里没有该技能，重置为占位项
        elm.val(elm.find("option").eq(0).val());
    }
    elm.change();
}

//护石技能等级恢复标志：加载配装时程序化选中下拉，避免等级被顶成 option 上限
var isCharmRestoring = false;
var CharmRestoreLv1 = 0;
var CharmRestoreLv2 = 0;

function onSelectCharmSkill(value) {
    let r = (value == null ? "" : String(value)).split("_");
    let p = r[0];
    let lvType = r[1];
    let hex = r[2];
    let lv = parseInt(r[3]);
    //选择了占位项"-----"或无效数据时，清空对应护石技能
    if (p != "1" && p != "2") {
        return;
    }
    //加载配装时：用缓存里的真实等级，而不是 option 上限
    if (isCharmRestoring && hex && hex != "00") {
        if (p == "1" && CharmRestoreLv1 > 0) lv = CharmRestoreLv1;
        if (p == "2" && CharmRestoreLv2 > 0) lv = CharmRestoreLv2;
    }
    if (p == "1") {
        CurData.charmData["skill1Hex"] = hex || "00";
        CurData.charmData["skill1Lv"] = hex ? lv : 0;
        CurData.charmData["skill1Type"] = lvType || "";

    } else {
        CurData.charmData["skill2Hex"] = hex || "00";
        CurData.charmData["skill2Lv"] = hex ? lv : 0;
        CurData.charmData["skill2Type"] = lvType || "";
    }
    initCharmSlotSel();
    refreshShowArmorData();
}
function onSelectCharmSlot(value) {
    CurData.charmData["slot"] = value;
    initDecorationSel("6");
    refreshShowArmorData();
}
function onInputDecoration(targ, value) {
    targ = $(targ);
    let id = targ.attr("id");
    id = id.split("_");
    let p = id[2];//decoration_input_6_1
    let idx = id[3];
    let v = value.split("_");
    let info = null;
    if (v.length > 1) {
        // 6C_2
        let r = value.split("_");
        let hex = r[0];
        let lv = parseInt(r[1]);
        // dname
        info = getDecorationDataByHexLv(hex, lv);
        if (info) {
            targ.val(info.dname);
        }
    } else {
        info = getDecorationDataByDName(value);
        if (value && !info) {
            targ.val("");
        }
    }

    let d = CurData.partMap[p];
    if (p == "6") {
        d = CurData.charmData;
    } else if (p == "7") {
        d = CurData.weaponData;
    }

    //该位置没有装备（或珠子数据）时忽略，避免清空/切换配装时的残留 change 报错
    if (!d || !d["decoration"] || !d["decoration"][idx]) {
        return;
    }
    d["decoration"][idx]["hex"] = info ? info.hex : "00";
    d["decoration"][idx]["lv"] = info ? info.lv : 0;
    refreshShowArmorData();

}

function setToPartDataSkillsChange(partIdx) {
    let partData = CurData.partMap[partIdx];
    if (partData) {
        //先重置
        partData["eq_k_skill"] = JSON.parse(JSON.stringify(partData["eq_skill"]));
        for (let i = 0; i < 7; i++) {
            let p = partData["k_skill"][i];
            let pHex = p["k_skill_hex"];
            let curType = p.type;
            if (curType == "skill") {
                //加减技能 这里还没有选具体的选项 应当重新计算所有选项 并且选择技能后 重复该操作
                let k = partData["eq_k_skill"];
                let skill_hex = p["k_skill_edit_hex"];
                if (skill_hex && (skill_hex != "00")) {
                    if (!k[skill_hex]) {
                        k[skill_hex] = {
                            "sname": getSkillNameByHex(skill_hex),
                            "hex": skill_hex,
                            "lv": 0,
                        }
                    }
                    k[skill_hex]["lv"] = k[skill_hex]["lv"] + ((pHex == "95") ? -1 : 1);
                }
            }
        }
    }
}

function intToHex(n) {
    if (!n) n = 0;
    return (parseInt(n)).toString(16).toUpperCase();
}

function getBoxNumberHex(partIdx) {
    let iPlace = parseInt(partIdx) - 1;
    let eq_pos_hex = 32 + iPlace * 8;
    return intToHex(eq_pos_hex);
}


function initDecorationSel(partIdx) {
    let s = "";
    if (partIdx == "6") {
        s = CurData.charmData["slot"];
    } else if (partIdx == "7") {
        //武器孔位：weaponData 是对象，取 slot 字段（如 "444"）
        s = CurData.weaponData ? (CurData.weaponData["slot"] || "") : "";
    } else {
        let partData = CurData.partMap[partIdx];
        if (partData) {
            s = partData["eq_k_slot"] || "";
        }
    }

    if (s) {
        s = s.split("");
        //清空
        for (let idx = 0; idx < 3; idx++) {
            let si = parseInt(s[idx]);
            let pc = ".decoration_input_" + partIdx + "_" + idx;
            let orgVal = $(pc).val();
            //移除原生 datalist（改用自建搜索面板）
            $(pc).removeAttr("list");
            $(pc).removeAttr("data-slot");

            if (!si || (si == 0)) {
                //禁用
                $(pc).attr("placeholder", `【0】`);
                $(pc).attr("disabled", true)
            } else {
                $(pc).attr("disabled", false)
                if (isExtremeMode) {
                    //极限模式：无论几级孔，都允许插入任意等级的珠子
                    $(pc).attr("data-slot", "4");
                    $(pc).attr("placeholder", `【${si}】(极限)`);
                } else {
                    $(pc).attr("data-slot", "" + si);
                    $(pc).attr("placeholder", `【${si}】`);
                }
            }
            //检查前面的值 和当前的值 如果不一样则清空 或者先禁用
            if (!si || si == 0) {
                //该位置没有孔：一定清空（无论是否极限模式）
                $(pc).val("");
            } else {
                let info = getDecorationDataByDName(orgVal);
                if (info && (isExtremeMode || si >= info["slot"])) {
                    $(pc).val(orgVal);
                } else {
                    $(pc).val("");
                }
            }
            $(pc).trigger("change");
        }
    } else {
        //无效孔位（空 / 未设置）：清空并禁用全部珠子框
        for (let idx = 0; idx < 3; idx++) {
            let pc = ".decoration_input_" + partIdx + "_" + idx;
            if (!$(pc).length) continue;
            $(pc).removeAttr("list").removeAttr("data-slot");
            $(pc).val("");
            $(pc).attr("placeholder", "【0】");
            $(pc).attr("disabled", true);
            $(pc).trigger("change");
        }
    }
    refreshShowArmorData();
}


function slot_simplify(armor_data) {
    if (!armor_data) return "000";
    let slot = "";
    for (let i = 4; i > 0; i--) {
        let count = armor_data[`slotLv${i}`];
        for (let j = 0; j < count; j++) {
            slot = slot + i;
        }
    }
    if (slot.length < 3) {
        for (let i = 0; i < 4 - slot.length; i++) {
            slot = slot + "0";
        }
    }
    return slot;
}



function createPartData(partIdx, armor_id) {
    let armor_data = getArmorById(armor_id);
    //装备不存在（如旧缓存的装备id已失效）时返回null，交由调用方处理，避免崩溃
    if (!armor_data) {
        return null;
    }

    let slot = slot_simplify(armor_data);
    let skm = {};
    for (let i = 0; i < armor_data["skill"].length; i++) {
        let s = armor_data["skill"][i];
        skm[s["hex"]] = { "sname": s["sname"], "lv": s["lv"], "hex": s["hex"] }
    }
    let skillOrg = JSON.parse(JSON.stringify(skm));
    let skillNew = JSON.parse(JSON.stringify(skm));

    let def = {
        def_p: armor_data["bougyo_max"],
        def_f: armor_data["def_f"],
        def_w: armor_data["def_w"],
        def_t: armor_data["def_t"],
        def_i: armor_data["def_i"],
        def_d: armor_data["def_d"]
    }

    //带k的是怪异化后的结果 无变化则是原来的值
    let data = {
        eq_id: armor_id,
        eq_partIdx: partIdx,
        eq_name: armor_data["name"],
        eq_pos: partIdx,
        eq_pos_hex: getBoxNumberHex(partIdx),
        eq_slot: slot,
        eq_k_slot: slot,
        eq_cost: getArmorCostById(armor_id),
        eq_k_cost: getArmorCostById(armor_id),
        eq_pool_id: "" + getArmorPoolById(armor_id),
        eq_def: def,
        eq_k_def: def,
        eq_skill: skillOrg,
        eq_k_skill: skillNew,
        k_skill: [
            { k_skill_hex: "00", k_skill_edit_hex: "00", k_skill_cost: 0 },
            { k_skill_hex: "00", k_skill_edit_hex: "00", k_skill_cost: 0 },
            { k_skill_hex: "00", k_skill_edit_hex: "00", k_skill_cost: 0 },
            { k_skill_hex: "00", k_skill_edit_hex: "00", k_skill_cost: 0 },
            { k_skill_hex: "00", k_skill_edit_hex: "00", k_skill_cost: 0 },
            { k_skill_hex: "00", k_skill_edit_hex: "00", k_skill_cost: 0 },
            { k_skill_hex: "00", k_skill_edit_hex: "00", k_skill_cost: 0 },
        ],
        decoration: [
            { "hex": "00", "lv": 0 },
            { "hex": "00", "lv": 0 },
            { "hex": "00", "lv": 0 },
        ]
    };
    return data;
}

function createCharmData() {
    return {
        sel1: [],
        sel2: [],
        skill1Hex: "00",
        skill1Lv: 0,
        skill1Type: "",
        skill2Hex: "00",
        skill2Lv: 0,
        skill2Type: "",
        slot: "000",
        decoration: [
            { "hex": "00", "lv": 0 },
            { "hex": "00", "lv": 0 },
            { "hex": "00", "lv": 0 },
        ]
    }
}
function createWeaponData() {
    return {
        slot: "444",
        decoration: [
            { "hex": "00", "lv": 0 },
            { "hex": "00", "lv": 0 },
            { "hex": "00", "lv": 0 },
        ]
    }

}
/////////////////////////////////////////////////////更新界面信息//////////////////////////////////////////////////////////////


function refreshShowArmorData() {

    if (isStopRender) return;
    RefreshCount++;
    setTimeout(function () {
        RefreshCount--;
        if (RefreshCount) {
            return;
        }

        try {
            //先复位防具一览表（全 0），避免空配装时残留上一次的数据
            initTable();
            //同步护石技能的只读显示框（真实数据在隐藏的 select 里）
            syncCharmDisplay("1");
            syncCharmDisplay("2");
            for (let partIdx in PartIdxMap) {
                let data = CurData.partMap[partIdx];
                if (data) {
                    //更新装备上的显示数据
                    render_armor_slot(partIdx, data);
                    render_armor_def(partIdx, data);
                    render_armor_skill(partIdx, data["eq_k_skill"]);
                    render_armor_cost(partIdx, data);
                } else {
                    //空位置：清掉装备技能/孔位等残留
                    $(".armor_skill_" + partIdx).html("");
                    $(".armor_slot_" + partIdx).html("");
                    $(".armor_cost_" + partIdx).html("");
                }
            }
            render_total_table();
        } catch (err) {
            //渲染异常时重置计数，避免后续刷新被永久跳过导致技能合计不显示
            RefreshCount = 0;
            console.error("render error:", err);
            showMsg("渲染异常:" + (err && err.message ? err.message : err));
        }
    }, 100)

}

function buildRenderData(hex) {
    return [getSkillNameByHex(hex), 0, 0, 0, 0, 0, 0, 0, 0, getSkillMaxByHex(hex)];
}
// 更新表格的信息
function render_total_table() {

    let allSkillMap = {};
    let th = `<th class="small" style="text-align: right;"></th>`;
    let tb = "";

    // 【修复点 1】：确保当前的 CurData 存在于 PartMapObj 中，且名称不为空
    let curName = CurData.name || DraftKey;
    CurData.name = curName;
    //注意：草稿必须用独立的深拷贝（不与 CurData 共享引用），否则清空草稿时会误清其他配装。
    //若当前正是草稿，则把 CurData 的深拷贝同步进草稿；否则把 CurData 引用存入对应配装名。
    if (curName === DraftKey) {
        PartMapObj[DraftKey] = JSON.parse(JSON.stringify({
            name: DraftKey,
            partMap: CurData.partMap,
            charmData: CurData.charmData,
            weaponData: CurData.weaponData
        }));
    } else {
        PartMapObj[curName] = CurData;
        //确保草稿占位存在（独立对象，不与 CurData 共享引用）
        if (PartMapObj[DraftKey] === undefined) {
            PartMapObj[DraftKey] = { name: DraftKey, partMap: {}, charmData: createCharmData(), weaponData: createWeaponData() };
        }
    }

    //排序：把"当前项"放到最前（"临时配装"和其他配装一样处理，不再强制置尾）
    PartMapAry = PartMapAry.filter(function (n) { return n !== curName; });
    PartMapAry.unshift(curName);
    //点草稿×清空后的一次性处理：把草稿移到最后
    if (draftToEndOnce) {
        draftToEndOnce = false;
        PartMapAry = PartMapAry.filter(function (n) { return n !== DraftKey; });
        PartMapAry.push(DraftKey);
    }
    //确保草稿始终在对比列表里显示
    if (!PartMapAry.includes(DraftKey)) {
        PartMapAry.push(DraftKey);
    }

    // 【修复点 2】：清理 PartMapAry 中的无效数据，防止报错
    PartMapAry = PartMapAry.filter(name => name && PartMapObj[name]);

    for (let j = 0; j < PartMapAry.length; j++) {
        let name = PartMapAry[j];
        doRender(PartMapObj[name], curName == name);
    }

    let keys = Object.keys(allSkillMap);
    keys.sort(function (a, b) {
        return parseInt(a, 16) - parseInt(b, 16);
    });

    for (let i = 0; i < keys.length; i++) {
        let hex = keys[i];
        /*if (isSkipSkill(hex)) {
            continue;
        }*/
        let d = allSkillMap[hex];
        let sn = d["sn"];
        let max = d["max"];
        let dm = d["map"];
        //判断"所有配装该技能的值是否都一样"（缺技能的配装按 0 计），用于折叠相同选项。
        // 注意："临时配装"（草稿）通常是空的，若它本行没有值则跳过它，避免因草稿为空导致永远无法折叠。
        let allSame = (function () {
            let rawMap = d["raw"] || {};
            //"临时配装"整体为空时，不参与折叠判断（避免空草稿导致永远无法折叠）。
            //但若草稿有技能（非空），则它的本行值（含 0）也应参与判断。
            let draftEmpty = !hasAnySkillData(PartMapObj[DraftKey]);
            let first = null, has = false;
            for (let j = 0; j < PartMapAry.length; j++) {
                let nm = PartMapAry[j];
                let v = rawMap[nm] || 0;
                //草稿整体为空、且本行没有值（0）时，跳过它
                if (nm === DraftKey && draftEmpty && v === 0) continue;
                if (!has) { first = v; has = true; }
                else if (v !== first) { return false; }
            }
            return has;
        })();
        tb = tb + `<tr class="${allSame ? "same-skill-cur" : ""}" ><td class="small" style="text-align: right;">${sn}</td>`;

        for (let j = 0; j < PartMapAry.length; j++) {
            let name = PartMapAry[j];
            tb = tb + `<td class="small">${dm[name] || ""}</td>`;
        }
        tb = tb + `</tr>`;
    }

    for (let j = 0; j < PartMapAry.length; j++) {
        let name = PartMapAry[j];
        // 【修复点 3】：安全读取数据，避免 PartMapObj[name] 为 undefined 导致 "cri" 读取失败
        let cacheData = PartMapObj[name];
        let cri = cacheData ? (cacheData["cri"] || 0) : 0;
        if (name === DraftKey) {
            //"临时配装"：× 不是移除，而是"清空草稿"，样式与普通 chip 的 × 区分
            th = th + `<th class="small compare-th"> <button type="button" class="btn switch_to_cache compare-chip compare-chip-draft" data-name="${name}" title="点击切换到临时配装">${displayName(name)}<span class="compare-chip-sub">会心${cri}</span><span class="clear_draft compare-chip-x compare-chip-x-draft" title="清空临时配装" name="${name}">×</span></button></th>`;
        } else {
            th = th + `<th class="small compare-th"> <button type="button" class="btn switch_to_cache compare-chip" data-name="${name}" title="点击切换到该配装">${displayName(name)}<span class="compare-chip-sub">会心${cri}</span><span class="remove_compare compare-chip-x" title="从比较列表中移除" name="${name}">×</span></button></th>`;
        }
    }
    document.getElementById("skill_table_head").innerHTML = th;
    document.getElementById("skill_table").innerHTML = tb;
    zipSame();

    function doRender(ptr, isSet) {
        // 【修复点 4】：增加兜底的空对象检查
        if (!ptr) return; 
        // 兜底：历史缓存可能缺少这些结构，避免渲染时报错
        if (!ptr.partMap) ptr.partMap = {};
        if (!ptr.charmData) ptr.charmData = {};
        if (!ptr.charmData["decoration"]) ptr.charmData["decoration"] = [];

        let name = ptr.name;
        let defTotal = { "p": 0, "f": 0, "w": 0, "t": 0, "i": 0, "d": 0 };
        let tt = ["p", "f", "w", "t", "i", "d"];
        let pnn = ["头", "身", "手", "腰", "腿", "护石", "武器"];
        let skillMap = {};
        for (let partIdx in ptr.partMap) {
            let data = ptr.partMap[partIdx];
            if (!data) continue;
            if (!data["decoration"]) data["decoration"] = [];
            if (!data["eq_k_skill"]) data["eq_k_skill"] = {};
            if (isSet) {
                document.getElementById(`armor_${partIdx}_name`).innerHTML = data["eq_name"] || pnn[parseInt(partIdx) - 1];
                document.getElementById(`armor_${partIdx}_pos`).innerHTML = data["eq_pos"] || partIdx;
                document.getElementById(`slot_${partIdx}`).innerHTML = data["eq_k_slot"] || "0";
                let defk = data["eq_k_def"] || {};
                for (let i = 0; i < tt.length; i++) {
                    let t = tt[i];
                    let d = defk[[`def_${t}`]] || 0;
                    document.getElementById(`def_${partIdx}_${t}`).innerHTML = d;
                    defTotal[t] = defTotal[t] + d;
                }
            }

            //怪异后的技能（包括本体装备）
            let skm = data["eq_k_skill"];
            for (let skill_hex in skm) {
                let s = skm[skill_hex];
                if (s["lv"] <= 0) {
                    //负数或0的 不处理
                    continue;
                }
                let hex = s["hex"];
                if (!skillMap[hex]) {
                    skillMap[hex] = buildRenderData(hex)
                }
                idx = parseInt(partIdx);
                skillMap[hex][idx] = skillMap[hex][idx] + s["lv"];
                //合计
                skillMap[hex][8] = skillMap[hex][8] + s["lv"];
            }

            for (let i = 0; i < data["decoration"].length; i++) {
                let d = data["decoration"][i];
                if (d["lv"]) {
                    let hex = d["hex"];
                    if (!skillMap[hex]) {
                        skillMap[hex] = buildRenderData(hex)
                    }
                    idx = parseInt(partIdx);
                    skillMap[hex][idx] = skillMap[hex][idx] + d["lv"];
                    //合计
                    skillMap[hex][8] = skillMap[hex][8] + d["lv"];
                }
            }
        }
        //
        if (isSet) {
            for (let i = 0; i < tt.length; i++) {
                let t = tt[i];
                document.getElementById(`def_total_${t}`).innerHTML = defTotal[t];;
            }
            $(".skill_info_btn").addClass("is-locked");
        }
        if (ptr.charmData.skill1Lv) {
            let hex = ptr.charmData.skill1Hex;
            if (!skillMap[hex]) {
                skillMap[hex] = buildRenderData(hex)
            }
            //极限模式下护石技能按15级计算
            let lv1 = isExtremeMode ? 15 : ptr.charmData.skill1Lv;
            skillMap[hex][6] = skillMap[hex][6] + lv1;
            skillMap[hex][8] = skillMap[hex][8] + lv1;
        }
        if (ptr.charmData.skill2Lv) {
            let hex = ptr.charmData.skill2Hex;
            if (!skillMap[hex]) {
                skillMap[hex] = buildRenderData(hex)
            }
            //极限模式下护石技能按15级计算
            let lv2 = isExtremeMode ? 15 : ptr.charmData.skill2Lv;
            skillMap[hex][6] = skillMap[hex][6] + lv2;
            skillMap[hex][8] = skillMap[hex][8] + lv2;
        }
        for (let i = 0; i < ptr.charmData["decoration"].length; i++) {
            let d = ptr.charmData["decoration"][i];
            if (d["lv"]) {
                let hex = d["hex"];
                if (!skillMap[hex]) {
                    skillMap[hex] = buildRenderData(hex)
                }
                skillMap[hex][7] = skillMap[hex][7] + d["lv"];
                //合计
                skillMap[hex][8] = skillMap[hex][8] + d["lv"];
            }

        }
        if (ptr.weaponData) {
            for (let i = 0; i < ptr.weaponData["decoration"].length; i++) {
                let d = ptr.weaponData["decoration"][i];
                if (d["lv"]) {
                    let hex = d["hex"];
                    if (!skillMap[hex]) {
                        skillMap[hex] = buildRenderData(hex)
                    }
                    skillMap[hex][7] = skillMap[hex][7] + d["lv"];
                    //合计
                    skillMap[hex][8] = skillMap[hex][8] + d["lv"];
                }
            }
        }

        let keys = Object.keys(skillMap);
        keys.sort(function (a, b) {
            return parseInt(a, 16) - parseInt(b, 16);
        });

        //会心率
        let critical = [];
        let criticalSum = 0;

        for (let i = 0; i < keys.length; i++) {
            let hex = keys[i];
            /*if (isSkipSkill(hex)) {
                continue;
            }*/
            let d = skillMap[hex];
            let sn = d[0];
            let cur = d[8];
            let max = d[9];
            if (!allSkillMap[hex]) {
                allSkillMap[hex] = {
                    "max": max,
                    "sn": sn,
                    "same": true,
                    "vm": [],
                    "raw": {},
                    "map": {}
                };
            }

            let rs = getRateByHex(hex, cur < max ? cur : max);
            if (rs && rs.r) {
                criticalSum = criticalSum + rs.r;
                critical.push(`${rs.r}(${sn})`);
            }
            allSkillMap[hex]["map"][name] = getProgressbar(cur, max);
            //记录该配装该技能的原始值（没这个技能时在下面统一补 0）
            allSkillMap[hex]["raw"][name] = cur;
            if (!allSkillMap[hex]["vm"].includes(cur)) {
                allSkillMap[hex]["vm"].push(cur);
            }

            if (isSet) {
                $("#skill_info_" + hex).removeClass("is-locked");
                $("#skill_info_" + hex).find(".skill_info_status").text(`${cur}/${max}`);
            }
        }
        if (isSet) {
            document.getElementById("critical").innerHTML = `${critical.join("+")}=${criticalSum}` + getProgressbar(criticalSum, 100);
        }
        ptr["cri"] = criticalSum;
    }
}


function getProgressbar(cur, max) {
    let t = `${cur}/${max}`;
    let r = parseInt((cur / max) * 100);
    //info danger success warning
    let bg = "bg-warning";
    if (r == 100) {
        bg = "bg-info";
    }
    if ((r > 100)) {
        bg = "bg-danger";
    }
    let str = `
    <div class="progress">
    <div class="progress-bar ${bg}" role="progressbar"  style="width: ${r}%;height:100%" aria-valuenow="${r}" aria-valuemin="0" aria-valuemax="100">${t}</div>
    </div>
    `
    return str;

}


function render_armor_skill(partIdx, skills_array) {
    let ul = $(".armor_skill_" + partIdx);
    ul.html("");
    if (skills_array) {
        for (i in skills_array) {
            let sname = skills_array[i]["sname"];
            let lv = skills_array[i]["lv"];
            if (lv < 0) {
                continue;
            }
            let skill = `${sname}：Lv${lv}`;
            let skill_node = document.createElement("li");
            skill_node.className = "list-group-item";
            skill_node.textContent = skill;
            ul.append(skill_node);
        }
    }

}

function render_armor_def(partIdx, data) {
    if (!data) data = {};
    let def = data["eq_def"];//原值
    let def_k = data["eq_k_def"] || {};



    $(".def_p_" + partIdx).html(def_k["def_p"] || 0);
    $(".def_f_" + partIdx).html(def_k["def_f"] || 0);
    $(".def_w_" + partIdx).html(def_k["def_w"] || 0);
    $(".def_t_" + partIdx).html(def_k["def_t"] || 0);
    $(".def_i_" + partIdx).html(def_k["def_i"] || 0);
    $(".def_d_" + partIdx).html(def_k["def_d"] || 0);
}

function render_armor_slot(partIdx, data) {
    let slot = "";
    if (data) {
        slot = data["eq_slot"] || "000";
        if (slot != data["eq_k_slot"]) {
            slot = slot + " >>> " + data["eq_k_slot"];
        }
    }
    $(".armor_slot_" + partIdx).html(slot)
}

function render_armor_cost(partIdx, data) {
    let c = 0;
    if (data) {
        c = data["eq_k_cost"] || 0;
    }
    $(".armor_cost_" + partIdx).html(c);
}








/////////////////////////////////////////////////////生成模板//////////////////////////////////////////////////////////////
function genAllTemplate() {
    let str = "";
    for (let idx in CurData.partMap) {

        let res = genArmorTemplate(CurData.partMap[idx]);
        if (res) {
            str = str + "\n" + res;
        }
    }
    str = str + genCharmTemplate();

    document.getElementById("template_result").textContent = str;
}
function genArmorTemplate(data) {

    let str = "";
    if (data) {

        //防御耐性- 0 耐性+ 1 防御+ 2
        let template_title = `[第0${data["eq_pos"]}格： ${data["eq_name"]} ${data["remarks"] || ""}${AutoGen ? "(自动生成)" : ""}]`;
        // k_skill_step start at 0x20, step 8, max 0x50, total 7 items
        let template = "";
        // 0C1001F6  0C2001F6
        //0C1-0C5 头 胸 手 腰腿  001F6 系列
        let ei = data["eq_id"].split("_");

        let armor_hex = intToHex(ei[0]);
        while (armor_hex.length < 4) {
            armor_hex = "0" + armor_hex;
        }
        armor_hex = `0C${ei[1]}0` + armor_hex;

        let armCode = `
580F0000 ${currentVersion.code}
580F1000 00000088
580F1000 00000028
580F1000 00000010
580F1000 000000${data["eq_pos_hex"]}
780F0000 00000030
680F0000 ${armor_hex} 00000002`;
        for (i = 32; i < 88; i += 8) {
            let index = i / 8 - 4;

            let ks = data["k_skill"][index];
            let td = ks["type_def"] || 0;

            let k_skill_step = intToHex(i);

            let k_skill_hex = ks["k_skill_hex"];
            let k_skill_edit_hex = ks["k_skill_edit_hex"];
            //单个区block 暂时的规律是每个版本都会变开头的数据
            let template_block = `
580F0000 ${currentVersion.code}
580F1000 00000088
580F1000 00000028
580F1000 00000010
580F1000 000000${data["eq_pos_hex"]}
580F1000 000000A0
580F1000 000000${k_skill_step}
780F0000 00000010
680F0000 0000000${td} 000000${k_skill_hex}
780F0000 00000008
680F0000 00000000 000000${k_skill_edit_hex}`;
            template += template_block;
        }
        str = template_title + (AutoGen ? armCode : "") + template + "\n";

    }
    return str;
}

function genCharmTemplate() {
    let slot = [0, 0, 0, 0];//1,2,3,4
    var s = CurData.charmData["slot"];
    let s1Hex = CurData.charmData["skill1Hex"];
    let s2Hex = CurData.charmData["skill2Hex"];
    let s1Lv = CurData.charmData["skill1Lv"] || 0;
    let s2Lv = CurData.charmData["skill2Lv"] || 0;
    if (CharmSkillMax || isExtremeMode) {
        //等级修改成 F(15) 则会变成最大值
        s1Lv = "F";
        s2Lv = "F";
    }
    if (!s) {
        return "";
    }
    let n1 = getSkillNameByHex(s1Hex) || "";
    let n2 = getSkillNameByHex(s2Hex) || "";
    //标题中把"F"显示为15，便于阅读（代码中仍使用F）
    let t1Lv = (s1Lv === "F") ? 15 : s1Lv;
    let t2Lv = (s2Lv === "F") ? 15 : s2Lv;
    let title = `[第06格${n1}${t1Lv}_${n2}${t2Lv}_S${s}]`;
    s = s.split("");
    for (let i = 0; i < s.length; i++) {
        let si = parseInt(s[i]);
        if (isNaN(si)) si = 0;
        if (si) {
            slot[si - 1]++;
        }
    }

    let slot1Num = slot[0] || 0;
    let slot2Num = slot[1] || 0;
    let slot3Num = slot[2] || 0;
    let slot4Num = slot[3] || 0;

    //400 311
    let box_pos_hex = "00000048";
    let charmType = "10100011";
    let b = `
${title}
580F0000 ${currentVersion.code}
580F1000 00000088
580F1000 00000028
580F1000 00000010
580F1000 ${box_pos_hex}
780F0000 00000030
680F0000 ${charmType} 00000003
580F0000 ${currentVersion.code}
580F1000 00000088
580F1000 00000028
580F1000 00000010
580F1000 ${box_pos_hex}
580F1000 00000080
780F0000 00000020
640F0000 00000000 0000${s2Hex}${s1Hex}
580F0000 ${currentVersion.code}
580F1000 00000088
580F1000 00000028
580F1000 00000010
580F1000 ${box_pos_hex}
580F1000 00000088
780F0000 00000020
680F0000 0000000${s2Lv} 0000000${s1Lv}
580F0000 ${currentVersion.code}
580F1000 00000088
580F1000 00000028
580F1000 00000010
580F1000 ${box_pos_hex}
580F1000 00000078
780F0000 00000020
680F1000 0000000${slot1Num} 00000000
680F1000 0000000${slot3Num} 0000000${slot2Num}
680F0000 00000000 0000000${slot4Num}`;
    return b;
}



function copyToClipboard() {
    let content = document.getElementById("template_result").textContent;
    let resultEl = document.getElementById("copy_result");

    function done(msg) {
        resultEl.innerText = msg;
        //复制提示 2 秒后自动消失
        clearTimeout(resultEl._hideTimer);
        resultEl._hideTimer = setTimeout(function () {
            resultEl.innerText = "";
        }, 2000);
    }

    //复制失败时：弹出输入框兜底，让用户长按手动复制
    function fallbackDialog() {
        done("复制失败");
        showPromptModal({
            title: "复制代码",
            text: "自动复制失败，请<strong>长按</strong>下方输入框手动复制：",
            withInput: true,
            inputValue: content,
            inputMaxlength: content.length + 10,
            okText: "再试一次",
            onOk: function (val) {
                copyText(val || content).then(function (ok) {
                    if (ok) showMsg("已复制代码");
                    else showMsg("复制失败，请长按输入框手动复制");
                });
                return false; //保持弹窗打开，方便继续手动复制
            }
        });
    }

    //优先用异步剪贴板 API（仅 HTTPS / localhost 可用）
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(content).then(function () {
            done("已复制到剪贴板");
        }).catch(function (err) {
            console.error("复制失败:", err);
            if (fallbackCopy(content)) {
                done("已复制到剪贴板");
            } else {
                fallbackDialog();
            }
        });
    } else {
        //非安全环境或旧浏览器：回退到 execCommand
        if (fallbackCopy(content)) {
            done("已复制到剪贴板");
        } else {
            fallbackDialog();
        }
    }
}

//旧版复制回退方案（execCommand）
function fallbackCopy(text) {
    try {
        let ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        let ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
    } catch (e) {
        console.error("fallbackCopy 失败:", e);
        return false;
    }
}

function downloadTxt() {
    // 读取页面里要保存的文字
    let content = document.getElementById("template_result").textContent;
    const fileName = `${currentVersion.BID}.txt`;

    try {
        // Android WebView 环境 → 调用系统「另存为」对话框
        if (window.Android && typeof window.Android.chooseFile === "function") {
            // 每次都会弹出系统保存框，用户自行挑选路径
            window.Android.chooseFile(fileName, content);
            showMsg("已调起保存：" + fileName);
        } else {
            // 浏览器 fallback（保留原来的 Blob 下载方式）
            const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
            const objectURL = URL.createObjectURL(blob);
            const aTag = document.createElement('a');
            aTag.href = objectURL;
            aTag.download = fileName;
            document.body.appendChild(aTag);
            aTag.click();
            setTimeout(() => {
                URL.revokeObjectURL(objectURL);
                document.body.removeChild(aTag);
            }, 0);
            showMsg("已开始下载：" + fileName);
        }
    } catch (err) {
        console.error("下载失败:", err);
        showMsg("下载失败:" + (err && err.message ? err.message : err));
    }
}

//重新排布所有 toast 的纵向位置（从上到下依次堆叠，互不重叠）
function relayoutMsgs() {
    let top = 12;
    for (let i = 0; i < MsgStack.length; i++) {
        let el = MsgStack[i];
        if (!document.body.contains(el)) continue;
        el.style.top = top + "px";
        // 累加自身高度 + 间距
        top += el.offsetHeight + 8;
    }
}

async function showMsg(msg) {
    MsgAry.push(msg);
    if (MsgLooping) {
        return;
    }
    MsgLooping = true;
    while (MsgAry.length) {
        let curMmsg = MsgAry.shift();
        if (curMmsg) {
            MsgCount++;
            let m = "msghint" + MsgCount;
            let color = (MsgCount % 2 == 0) ? "alert-primary " : "alert-info";
            let s = `
                <div class="msghint ${m} alert ${color} align-items-center fade show" role="alert">            
                <div>${curMmsg}</div>
                </div>`
            $("body").append(s);
            //加入堆叠队列，重新排布（新消息排在已有消息下方）
            let el = document.querySelector("." + m);
            if (el) {
                MsgStack.push(el);
                relayoutMsgs();
            }
            //到时移除，并重新排布剩余消息
            setTimeout(function () {
                $(`.${m}`).remove();
                MsgStack = MsgStack.filter(function (n) { return n !== el; });
                relayoutMsgs();
            }, 2500);
            await timeLag(250);
        }
    }
    MsgLooping = false;

}

function timeLag(t) {
    return new Promise(function (resolve, reject) {
        setTimeout(function () {
            resolve(true);
        }, t)
    });
}

//日期时间处理
function format(date, fmt) {
    var args = arguments;
    if (args.length == 1) {
        date = args[0];

    }
    if (!fmt) {
        fmt = "yyyy-MM-dd hh:mm:ss";
    }
    if (Object.prototype.toString.call(fmt) == "[object Date]") {
        var str = date;
        date = fmt;
        fmt = str;
    }
    var time;
    if (!date) return "";
    if (typeof date === 'string') {
        time = new Date(date.replace(/-/g, '/').replace(/T|Z/g, ' ').replace(/.000/g, ' ').trim());
    } else if (date instanceof Date) {
        time = new Date(date);
    }
    var o = {
        "M+": time.getMonth() + 1, //月份
        "d+": time.getDate(), //日
        "h+": time.getHours(), //小时
        "m+": time.getMinutes(), //分
        "s+": time.getSeconds(), //秒
        "q+": Math.floor((time.getMonth() + 3) / 3), //季度
        "S": time.getMilliseconds() //毫秒
    };
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (time.getFullYear() + "").substr(4 - RegExp.$1.length));
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
    }
    return fmt;
}



function getRateByHex(hex, curLv) {
    let ug = {
        "01": {
            "always": true, "sit": "",
            "upg": [
                { "lv": 1, "atk": 3, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 6, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 9, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 7, "atk_rate": 1.05, "critical": 0, },
                { "lv": 1, "atk": 8, "atk_rate": 1.06, "critical": 0, },
                { "lv": 1, "atk": 9, "atk_rate": 1.08, "critical": 0, },
                { "lv": 1, "atk": 10, "atk_rate": 1.1, "critical": 0, }
            ],
        },
        "02": {
            "always": false, "sit": "愤怒",
            "upg": [
                { "lv": 1, "atk": 4, "atk_rate": 0, "critical": 3, },
                { "lv": 1, "atk": 8, "atk_rate": 0, "critical": 5, },
                { "lv": 1, "atk": 12, "atk_rate": 0, "critical": 7, },
                { "lv": 1, "atk": 16, "atk_rate": 0, "critical": 10, },
                { "lv": 1, "atk": 20, "atk_rate": 0, "critical": 15, },
            ]
        },
        "03": {
            "always": false, "sit": "无伤",
            "upg": [
                { "lv": 1, "atk": 5, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 10, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 20, "atk_rate": 0, "critical": 0, },
            ]
        },
        "04": {
            "always": false, "sit": "红血",
            "upg": [
                { "lv": 1, "atk": 5, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 10, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 15, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 20, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 25, "atk_rate": 0, "critical": 0, },
            ]
        },
        "05": {
            "always": false, "sit": "异常状态",
            "upg": [
                { "lv": 1, "atk": 5, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 10, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 20, "atk_rate": 0, "critical": 0, },
            ]
        },

        "06": {
            "always": true, "sit": "",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 5, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 10, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 15, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 20, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 25, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 30, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 40, }
            ],
        },
        "08": {
            "always": false, "sit": "弱点",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 15, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 30, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 50, },
            ],
        },
        "09": {
            "always": false, "sit": "力量解放",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 10, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 20, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 30, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 40, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 50, },
            ],
        },

        "0A": {
            "always": false, "sit": "满耐力",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 10, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 20, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 30, },
            ],
        },
        "25": {
            "always": false, "sit": "GP防御成功",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 1.05, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.10, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.15, "critical": 0, },
            ],
        },
        "26": {
            "always": false, "sit": "拔刀后2s？",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 15, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 30, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 60, },
            ],
        },
        "27": {
            "always": false, "sit": "拔刀第一刀",
            "upg": [
                { "lv": 1, "atk": 3, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 5, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 7, "atk_rate": 0, "critical": 0, },
            ],
        },
        "5B": {
            "always": false, "sit": "体力在最大值的35%以下时",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.05, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.05, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.1, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.3, "critical": 0, },
            ],
        },
        "5C": {
            "always": false, "sit": "猫车后（每次触发 做多2次）",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 1.1, "critical": 0, },
            ],
        },
        "67": {
            "always": false, "sit": "体力在最大值的70%-80%以下时",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.05, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.1, "critical": 0, },
            ],
        },

        "6A": {
            "always": false, "sit": "被击飞后",
            "upg": [
                { "lv": 1, "atk": 10, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 15, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 25, "atk_rate": 0, "critical": 0, },
            ],
        },
        "71": {
            "always": false, "sit": "蓝书 啮生虫越多，攻击性能则会进一步上升 15/20/25、20/25/30、25/30/35",
            "upg": [
                { "lv": 1, "atk": 25, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 30, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 35, "atk_rate": 0, "critical": 0, },
            ],
        },
        "73": {
            "always": false, "sit": "红书  15/20/35",
            "upg": [
                { "lv": 1, "atk": 15, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 20, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 35, "atk_rate": 0, "critical": 0, },
            ],
        },
        "74": {
            "always": false, "sit": "异常恢复",
            "upg": [
                { "lv": 1, "atk": 12, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 15, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 18, "atk_rate": 0, "critical": 0, },
            ],
        },
        "75": {
            "always": false, "sit": "感染增加攻击克服增加会心",
            "upg": [
                { "lv": 1, "atk": 10, "atk_rate": 0, "critical": 20, },
                { "lv": 1, "atk": 20, "atk_rate": 0, "critical": 25, },
                { "lv": 1, "atk": 20, "atk_rate": 0, "critical": 25, },
            ],
        },

        "77": {
            "always": false, "sit": "背后攻击",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 1.05, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.1, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.2, "critical": 0, },
            ],
        },
        "78": {
            "always": false, "sit": "精确回避",
            "upg": [
                { "lv": 1, "atk": 10, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 15, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 30, "atk_rate": 0, "critical": 0, },
            ],
        },
        "7D": {
            "always": false, "sit": "怪物异常眠麻毒爆",
            "upg": [
                { "lv": 1, "atk": 10, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 10, "atk_rate": 0, "critical": 10, },
                { "lv": 1, "atk": 15, "atk_rate": 0, "critical": 20, },
            ],
        },
        "83": {
            "always": false, "sit": "连续命中",
            "upg": [
                { "lv": 1, "atk": 5, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 5, "atk_rate": 0, "critical": 0, },
                { "lv": 1, "atk": 5, "atk_rate": 0, "critical": 0, },
            ],
        },
        "88": {
            "always": false, "sit": "触发异常攻击时",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 1.1, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.15, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.2, "critical": 0, },
            ],
        },
        "8C": {
            "always": false, "sit": "寒气槽存在时 按阶段增加",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 1.05, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.2, "critical": 0, },
                { "lv": 1, "atk": 0, "atk_rate": 1.3, "critical": 0, },
            ],
        },
        "91": {
            "always": false, "sit": "按红槽长度",
            "upg": [
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 10, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 15, },
                { "lv": 1, "atk": 0, "atk_rate": 0, "critical": 20, },
            ],
        }


    };

    if (ug[hex]) {
        let d = ug[hex];
        let c = d["upg"][curLv - 1];
        //极限模式下等级可能超过会心表长度，取最后一级兜底，避免报错导致技能合计表无法渲染
        if (!c) {
            c = d["upg"][d["upg"].length - 1];
        }
        if (!c) {
            return null;
        }
        let r = c["critical"] || 0;
        let s = d["sit"];
        return { r, s };
    }
    return null;
}


function initSkillInfo() {
    let s = Object.keys(skill_data);
    s.sort();

    let arrM = {};
    for (let i = 0; i < s.length; i++) {
        let hex = s[i];
        let d = skill_data[hex];
        let t = d["tag"][0];
        if (!arrM[t]) {
            arrM[t] = [];

        }
        arrM[t].push([hex, d["sname"]]);
    }
    let ctx = "";
    for (let t in arrM) {
        let a = arrM[t];
        //分类标题 + 一个 grid 容器（列数由 CSS 决定，不再手动按颜色数组分组，避免出现"5个1个"错位）
        let str = `<div class="m-1 row si-cat-title" title="${t}">${t}</div>`;
        str += `<div class="m-1 row" title="${t}">`;
        for (let i = 0; i < a.length; i++) {
            let hex = a[i][0];
            let name = a[i][1];
            // 名字较长的技能加 is-long（用更小字号，避免文字贴边/溢出铭牌）
            let nameLen = String(name).length;
            let nameCls = nameLen >= 7 ? " is-long" : (nameLen >= 6 ? " is-mid" : "");

            str = str + `            
            <div class="col col-2 row skill_info_div">
            <button type="button" id="skill_info_${hex}" class="skill_info_btn is-locked${nameCls} btn rounded">
            <span>${name}</span><span class="skill_info_status">0/0</span>
            </button>            
            </div>
            `
        }
        str += `</div>`;
        ctx = ctx + str;
    }
    $("#skillInfo").html(ctx);
}

function clickSkillInfo(id, title) {
    // hex 就是按钮 id 去掉 "skill_info_" 前缀
    let hex = String(id || "").replace("skill_info_", "");
    let info = (typeof skill_desc !== "undefined") ? skill_desc[hex] : null;
    if (info) {
        let html = "";
        if (info["desc"]) {
            html += `<div class="text-secondary small mb-2">${info["desc"]}</div>`;
        }
        if (info["effect"]) {
            html += info["effect"];
        }
        if (!html) {
            html = "暂无技能效果说明";
        }
        // 弹窗内 ul 紧凑一点
        html = `<div class="skill-desc-body">${html}</div>`;
        showPromptModal({
            title: (info["sname"] || "") + " · 技能效果",
            text: html,
            okText: "知道了",
            okClass: "btn-primary",
            hideCancel: true,
            dismissOnBackdrop: true
        });
        return;
    }
    // 没有技能数据时，退回原来的"标记边框"行为
    if ($("#" + id).hasClass("border")) {
        $("#" + id).removeClass("border");
        $("#" + id).removeClass("border-5");
    } else {
        $("#" + id).addClass("border");
        $("#" + id).addClass("border-5");
    }
}

//使用缓存的数据进行比较
async function addToCompare(name) {


    //
    if (PartMapAry.includes(name)) {
        return;
    }

    try {
        let cache = await execLoad(name);
        if (cache) {
            PartMapObj[name] = cache;
            PartMapAry.push(name);
            refreshShowArmorData();
        }
        loadCompareList();
    } catch (err) {
        //
        showMsg("读取失败");
    }

}

//从比较中移除
async function removeFromCompare(name) {
    if (PartMapAry <= 1) {
        return;
    }
    for (let i = 0; i < PartMapAry.length; i++) {
        if (PartMapAry[i] == name) {
            PartMapAry.splice(i, 1);
        }
    }
    refreshShowArmorData();
    loadCompareList();
}
//折叠相同或展开
function zipSame() {
    let trL = $("#skill_table").find("tr");
    if (ZipSameItem) {
        for (let i = 0; i < trL.length; i++) {
            if ($(trL[i]).hasClass("same-skill-cur")) {
                $(trL[i]).hide();
            }
        }
    } else {
        for (let i = 0; i < trL.length; i++) {
            if ($(trL[i]).hasClass("same-skill-cur")) {
                $(trL[i]).show();
            }
        }
    }
    //遍历 隐藏数据
}