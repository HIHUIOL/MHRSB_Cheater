



//要怎么获取这个值
// var version_code = "11D95B00";//12.0.1
// var version_code = "12400610";//13.0.1
// var version_code = "123693D0";//14.0.1
// var version_code = "129E11D8";//15.0.1
// var version_code = "12A4FD80";//16.0.0
// var version_code = "12A4A1E8";//16.0.1
// var version_code = "129A7D80";//16.0.1 美版

var TID = "0100559011740000";
// var BID = "44C9289FBB51455F";//16.0.0
// var BID = "92DF51D37268A38C";//16.0.1
// var BID = "D2FD97779381FB9A"//16.0.2

var versionMap = {
    "16.0.2-港日": { "v": "16.0.2-港日", "BID": "D2FD97779381FB9A", "code": "12B157C0" },
    "16.0.1-港日": { "v": "16.0.1-港日", "BID": "92DF51D37268A38C", "code": "12A4A1E8" },
    "16.0.1-美版": { "v": "16.0.1-美版", "BID": "92DF51D37268A38C", "code": "129A7D80" },
    "16.0.0": { "v": "16.0.0", "BID": "44C9289FBB51455F", "code": "12A4FD80" },
}

var currentVersion = versionMap["16.0.2-港日"];

var RefreshCount = 0;

let isFastMode = false;

var isStopRender = false;

var cost_skill_hex = {};
var DecoratrionSel = {};
var DecoratrionNameMap = {};
var DecoratrionHexLvMap = {};

var PartIdxMap = {
    "1": "head",
    "2": "body",
    "3": "hand",
    "4": "waist",
    "5": "foot",
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


var AutoGen = false;
var CharmSkillMax = false;
var ZipSameItem = false;
var TmpCacheName = "临时缓存";
var CacheObj = null;
var CList = [];
var MsgCount = 0;
var MsgAry = [];
var MsgLooping = false;

init();
async function init() {

    stopRender();
    for (let i in PartIdxMap) {
        CurData.partMap[i] = null;
    }
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
    initCharmSkillData();
    initDecorationData();
    initHtml();
    initTable();

    initCharmSel();
    bindEvents();
    $("#reInit").off("click").on("click", async function(){location.reload();});

    $("#version").change();
    $("#menu2").hide();
    startRender();
    showMsg("初始化完成");
    await initCache();
    // await timeLag(500);
    $("#main").show();



}

async function initCache() {
    //根据版本获取？
    showMsg("加载缓存");
    $("#saveCache-spinner").hide();
    let cc = new Cache("MHRSB", "sys", 1);
    await cc.init();
    CacheObj = cc;
    let last = await loadList();


    //默认显示最后一个设置    
    //await loadCache(last);

}
//加载历史缓存列表
async function loadList() {
    let cl = await CacheObj.readAll();
    CList = [];
    cl.sort(function (a, b) {
        return b.v.t - a.v.t;
    });

    let str = "";
    let cl0 = ((cl && cl[0]) ? cl[0]["k"] : TmpCacheName);
    if (cl0) {
        PartMapAry.push(cl0);
    }
    for (let i = 0; i < cl.length; i++) {

        let n = cl[i]["k"];
        let t = cl[i]["v"]["t"];
        cl[i]["v"]["name"] = n;
        CList.push(cl[i]["v"]["name"]);
        let tmp = cl[i]["v"];
        if (!tmp["name"]) tmp["name"] = n;
        if (!tmp["partMap"]) tmp["partMap"] = tmp["PartMap"];
        if (!tmp["charmData"]) tmp["charmData"] = tmp["CharmData"];
        if (!tmp["weaponData"]) tmp["weaponData"] = tmp["WeaponData"];
        // PartMapAry.push(n);
        PartMapObj[n] = tmp;
        t = format(t);
        str = str + `<li title="${n}-${t}"><a class="dropdown-item ">
        <div class="col col-sm-auto">
        <a class="btn cacheItem" >${n}<a>
        <a class="btn btn-danger deleteCache right" style="float: right;">删除<a>
        </div>
        </a></li>`;
    }
    $(".dropdown-menu-cache").html(str);
    loadCompareList();
    return cl0;
}
function loadCompareList() {

    let str2 = "";
    for (let i = 0; i < CList.length; i++) {

        let n = CList[i];
        //已经在对比列表的 不加入
        if (PartMapAry.includes(n)) continue;
        str2 = str2 + `<li title="${n}"><a class="dropdown-item ">
        <div class="col col-sm-auto">
        <a class="compareItem" >${n}<a>
        <a class="btn btn-danger addToCompare right" style="float: right;">添加<a>
        </div>
        </a></li>`;
    }
    $(".dropdown-menu-compare").html(str2);
}
async function loadCache(name) {
    let cahe = await execLoad(name);
    if (cahe) {
        showMsg("加载中:" + name);
        try {

            // cahe.Name;
            let tmp = cahe.PartMap || cahe.partMap;;
            let tmpC = cahe.CharmData || cahe.charmData;
            let tmpW = cahe.WeaponData || cahe.weaponData;
            // startRender();
            //用于以前的编号问题
            let cmm = {
                "9999991": "498",
                "9999992": "499",
                "9999993": "500",
                "9999994": "506",
                "9999995": "502",
            }
            for (let idx in tmp) {
                let pd = tmp[idx];
                if (pd["eq_id"]) {
                    let aa = pd["eq_id"].split("_");
                    if (cmm[aa[0]]) {
                        pd["eq_id"] = cmm[aa[0]] + "_" + aa[1];
                    }

                    $(".armor_select_" + idx).val(pd["eq_id"]);
                    $(".armor_select_" + idx).change();
                    // armor_container_
                    // small form-select k_skill_select
                    let sd = pd["k_skill"];
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
                    for (let i = 0; i < pd["decoration"].length; i++) {
                        let d = pd["decoration"][i];

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
                let v1 = `${1}_${tmpC["skill1Type"]}_${tmpC["skill1Hex"]}_${tmpC["skill1Lv"]}`;
                let v2 = `${2}_${tmpC["skill2Type"]}_${tmpC["skill2Hex"]}_${tmpC["skill2Lv"]}`;
                let v3 = tmpC["slot"];
                $("#charm_skill_select1").val(v1);
                $("#charm_skill_select1").change();
                $("#charm_skill_select2").val(v2);
                $("#charm_skill_select2").change();
                $("#charm_slot_select").val(v3);
                $("#charm_slot_select").change();
                for (let i = 0; i < tmpC["decoration"].length; i++) {
                    let d = tmpC["decoration"][i];
                    if ((d["hex"] != "00") && (d["lv"] > 0)) {
                        let v4 = `${d["hex"]}_${d["lv"]}`;
                        $(`.decoration_input_${6}_${i}`).val(v4);
                        $(`.decoration_input_${6}_${i}`).trigger("change");
                    }
                }
                CurData.charmData = tmpC;
            }
            if (tmpW) {
                for (let i = 0; i < tmpW["decoration"].length; i++) {
                    let d = tmpW["decoration"][i];
                    if ((d["hex"] != "00") && (d["lv"] > 0)) {
                        let v4 = `${d["hex"]}_${d["lv"]}`;
                        $(`.decoration_input_${7}_${i}`).val(v4);
                        $(`.decoration_input_${7}_${i}`).trigger("change");
                    }
                }
                CurData.weaponData = tmpW;
            }
            CurData.name = name;
            if (name != TmpCacheName) $("#cache-name").val(name);
            $("#curTitle").text(name);
            refreshShowArmorData();
            showMsg("加载完成:" + name);
        } catch (err) {
            showMsg("加载缓存失败-" + JSON.stringify(err));
            if (confirm(`加载缓存失败 是否删除【${name}】？`)) {
                delCache(name);
            }
        }
    } else {
        //没有找到对应的缓存
        // showMsg("加载失败:" + name);
    }

}
//保存当前设置缓存
async function saveCache() {
    // prompt
    $("#saveCache-spinner").show();
    let name = $("#cache-name").val();
    if (name) {
        CurData.name = name;
        await execSave(name, CurData.partMap, CurData.charmData, CurData.weaponData);
        $("#saveCache-spinner").hide();
        //需要更新名称
        $("#cache-name").val(name);
        showMsg("保存成功:" + name);
        await loadList();
        $('#cacheModal').modal('hide');
    } else {
        $("#cache-name").focus();
        $("#saveCache-spinner").hide();
    }
}
//设置临时缓存
async function setTmpCache() {
    await execSave(TmpCacheName, CurData.partMap, CurData.charmData, CurData.weaponData);
    showMsg("缓存成功");
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

async function shareTmpCache() {
    try {
        const cache = await CacheObj.get(TmpCacheName);
        if (!cache) throw new Error("没有找到临时缓存，请先设置临时缓存");
        const json = JSON.stringify({ partMap: cache.partMap, charmData: cache.charmData, weaponData: cache.weaponData });
        const code = TmpCacheSharePrefix + bytesToBase64(await gzipCompress(json));
        await navigator.clipboard.writeText(code);
        showMsg("分享码已复制，长度:" + code.length);
    } catch (err) {
        console.error(err);
        showMsg("分享失败:" + err.message);
    }
}

async function importTmpCache() {
    try {
        const code = $("#importCacheText").val().trim().replace(/\s+/g, "");
        if (!code.startsWith(TmpCacheSharePrefix)) throw new Error("分享码格式错误");
        const json = await gzipDecompress(base64ToBytes(code.substring(TmpCacheSharePrefix.length)));
        const data = JSON.parse(json);
        if (!data || typeof data !== "object" || !data.partMap || !data.charmData || !data.weaponData) {
            throw new Error("分享码数据不完整");
        }
        await execSave(TmpCacheName, data.partMap, data.charmData, data.weaponData);
        await loadList();
        $("#importCacheText").val("");
        $("#importCacheModal").modal("hide");
        await loadCache(TmpCacheName);
        showMsg("临时缓存导入成功");
    } catch (err) {
        console.error(err);
        showMsg("导入失败:" + err.message);
    }
}

async function execSave(n, p, c, w, t) {
    await CacheObj.add(n, { "name": n, "partMap": p, "charmData": c, "weaponData": w, "t": t ? t : new Date() });
}
async function execLoad(n) {

    let cache = null;
    try {
        cache = await CacheObj.get(n);
        if (cache.PartMap) {
            cache.partMap = cache.PartMap;
            delete (cache.PartMap);
            cache.charmData = cache.CharmData;
            delete (cache.CharmData);
            cache.weaponData = cache.WeaponData;
            delete (cache.WeaponData);
            if (!cache.name) cache.name = n;
            delete (cache.Name);
            await execSave(cache.name, cache.partMap, cache.charmData, cache.weaponData, cache.t);
        }
    } catch (err) {
        console.log(err);
        showMsg("获取缓存失败" + err.message);
    }
    return cache;
}
async function delCache(name) {
    await CacheObj.delete(name);
    // console.log(name);
    showMsg("删除成功:" + name);
    await loadList();
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
    isFastMode = !isFastMode;
    if (isFastMode) {
        $("#switchMode").text("切换至普通模式");
    } else {
        $("#switchMode").text("切换至快速模式");
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
            //return -101
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
        DecoratrionSel["" + slot] = a;
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
        // console.log(dselStr)
        t.find(".decoration_select_container").html(dselStr);

        t.find(".k_skill_tbody").html(tr);

        t.find(".k_skill_tbody").addClass("k_skill_tbody_" + idx);
        t.find(".armor_select").addClass("armor_select_" + idx);
        t.find(".armor_pos").addClass("armor_pos_" + idx);
        t.find(".armor_slot").addClass("armor_slot_" + idx);
        t.find(".armor_cost").addClass("armor_cost_" + idx);

        t.find(".def_p").addClass("def_p_" + idx);
        t.find(".def_f").addClass("def_f_" + idx);
        t.find(".def_w").addClass("def_w_" + idx);
        t.find(".def_t").addClass("def_t_" + idx);
        t.find(".def_i").addClass("def_i_" + idx);
        t.find(".def_d").addClass("def_d_" + idx);

        t.find(".armor_skill").addClass("armor_skill_" + idx);


        html += `
<div class="col-12 col-sm-6 col-md-4 col-lg-3 col-xl armor_container_${idx}">
    <div class="armor_container">
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
    $("#setTmpCache").on("click", function (event) {
        setTmpCache();
    });
    $("#shareTmpCache").on("click", function () {
        shareTmpCache();
    });
    $("#confirmImportTmpCache").on("click", function () {
        importTmpCache();
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
        loadCache(event.target.text);
    });

    $(".dropdown-menu-cache").on("click", ".deleteCache", function (event) {
        delCache($(event.target).parent().find(".cacheItem").text());
    });

    $(".dropdown-menu-compare").on("click", ".addToCompare", function (event) {
        addToCompare($(event.target).parent().find(".compareItem").text())
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
    return sd["max"];
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
    // { hex: "45", name: "防御+3", cost: 1 },    
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
function getFastModeCostSkill() {


    // { sname: "壁面移動【翔】", hex: "81" },
    // { sname: "腹減り耐性", hex: "60" },       
    // { sname: "風圧耐性", hex: "3E" },
    // { "hex": "75", "sname": "狂龙症【蚀】", "cost": 12, "max": 3, "lvType": "", "p1Max": 0, "p2Max": 0 },

    let skm = { "81": null, "60": null, "3E": null, "75": null };
    for (let hex in skm) {
        skm[hex] = skill_data[hex];
    }
    return skm;
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

    // let m = {
    //     "SS": ["400", "311"],
    //     "SA": ["400", "311"],
    //     "SB": ["400", "311"],
    //     "SC": ["400", "311"],
    //     "S": ["400", "311"],
    //     "AS": ["400", "311"],
    //     "AA": ["400", "311"],
    //     "AB": ["400", "311"],
    //     "AC": ["400", "311"],
    //     "A": ["400", "311"],
    //     "BS": ["400", "311"],
    //     "BA": ["400", "311"],
    //     "BB": ["400", "321"],
    //     "BC": ["400", "321"],
    //     "B": ["400", "321"],
    //     "CS": ["400", "311"],
    //     "CA": ["400", "311"],
    //     "CB": ["400", "321"],
    //     "CC": ["400", "321"],
    //     "C": ["400", "321"],
    // }
    return m[sklvType];
}

function getDecorationSelData(slot) {
    return DecoratrionSel["" + slot];
}



function initCharmSel() {
    for (let i = 0; i < CurData.charmData["sel1"].length; i++) {
        let o = CurData.charmData["sel1"][i];
        let opt = document.createElement("option");
        opt.value = "1_" + o["lvType"] + "_" + o["hex"] + "_" + o["p1Max"];
        opt.text = o["sname"] + " " + o["p1Max"];
        $("#charm_skill_select1").append(opt);
    }
    for (let i = 0; i < CurData.charmData["sel2"].length; i++) {
        let o = CurData.charmData["sel2"][i];
        let opt = document.createElement("option");
        opt.value = "2_" + o["lvType"] + "_" + o["hex"] + "_" + o["p2Max"];
        opt.text = o["sname"] + " " + o["p2Max"];;
        $("#charm_skill_select2").append(opt);
    }
}

function initCharmSlotSel() {
    let h = getCharmSlotMap(CurData.charmData["skill1Type"] + CurData.charmData["skill2Type"]);
    let elm = $("#charm_slot_select");
    let ov = elm.val();
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
            <td id="dec_${partIdx}"></td>
        </tr>`;
    }
    //护石
    str = str + `<tr>
        <td>护石</td>
        <td>-</td>
        <td >-</td>
        <td >-</td>
        <td >-</td>
        <td >-</td>
        <td >-</td>
        <td >-</td>
        <td id="slot_charms">0</td>
        <td id="dec_charms"></td>
    </tr>`
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
                if (isFastMode && !isWT) {
                    if (/防御|耐性/.test(skData["name"])) {
                        continue;
                    }
                }
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

            //初始化上次选择的减技能，增技能的内容
            clearOldNewSkillSel(partIdx, i);
            //默认前三个是减技能 并且 减去无用技能 第四个增加3孔位


            if (isFastMode && !isWT) {

                if (i < 3) {
                    sel.val(`${partIdx}_${i}_95_-10`);
                    sel.change();
                    let skillSel = $(tr[i]).find("td").eq(1).find(".k_skill_change");
                    skillSel.val(skillSel.find("option").eq(1).val());
                    skillSel.change();
                }
                if (i == 3) {
                    sel.val(`${partIdx}_${i}_8D_18`);
                    sel.change();
                }

            }

        }
    }
}
function onSelectArmor(armor_id) {
    if (armor_id == "-----") {
        //清空数据
        CurData.partMap[partIdx] = null;
        return;
    }

    let partIdx = armor_id.split("_")[1];

    let data = CurData.partMap[partIdx];
    if (!data || (data["eq_id"] != armor_id)) {
        data = createPartData(partIdx, armor_id);
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
//选择怪异选项
function onSelectKSkill(value) {
    //idx 0-6
    let t_values = value.split('_');//event.target.value.split('_');
    let partIdx = t_values[0];
    let idx = t_values[1];
    let k_skill_hex = t_values[2];
    let k_skill_cost = parseInt(t_values[3]);

    clearOldNewSkillSel(partIdx, idx);
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
        //该模式下 可以减去任意技能（包括非本装备的）
        if (isFastMode) {
            //注意这里应该使用的是 低cost废技能 例如饥饿耐性 风压耐性
            skm = getFastModeCostSkill();
        }
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

    refreshShowArmorData();
}


function onSelectChangeSkill(value) {
    //选择增加技能 或者 减去旧技能
    // if(!value){
    //     return;
    // }
    let r = value.split("_");
    let partIdx = r[0], idx = parseInt(r[1]), hex = r[2];
    CurData.partMap[partIdx]["k_skill"][idx]["k_skill_edit_hex"] = hex;
    setToPartDataSkillsChange(partIdx);
    refreshShowArmorData();
}

function onSelectCharmSkill(value) {
    let r = value.split("_");
    let p = r[0];
    let lvType = r[1];
    let hex = r[2];
    let lv = parseInt(r[3]);
    if (p == "1") {
        CurData.charmData["skill1Hex"] = hex;
        CurData.charmData["skill1Lv"] = lv;
        CurData.charmData["skill1Type"] = lvType;

    } else {
        CurData.charmData["skill2Hex"] = hex;
        CurData.charmData["skill2Lv"] = lv;
        CurData.charmData["skill2Type"] = lvType;
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

    // targ.data(info);

    let d = CurData.partMap[p];
    if (p == "6") {
        d = CurData.charmData;
    } else if (p == "7") {
        d = CurData.weaponData;
    }

    d["decoration"][idx]["hex"] = info ? info.hex : "00";
    d["decoration"][idx]["lv"] = info ? info.lv : 0;
    refreshShowArmorData();

}
function onSelectDecoration(value) {
    //
    if (!value) return;
    let r = value.split("_");
    let p = r[0];
    let idx = parseInt(r[1]);
    let hex = r[2];
    let lv = parseInt(r[3]);
    // decoration:[
    //     {"hex":"00","lv":0},
    //     {"hex":"00","lv":0},
    //     {"hex":"00","lv":0},
    // ]
    let d = CurData.partMap[p];
    if (p == "6") {
        d = CurData.charmData;
    } else if (p == "7") {
        d = CurData.weaponData;
    }

    d["decoration"][idx]["hex"] = hex;
    d["decoration"][idx]["lv"] = lv;
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
        s = CurData.weaponData;
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
            $(pc).attr("list", "");

            if (!si || (si == 0)) {
                //禁用
                $(pc).attr("placeholder", `【0】`);
                $(pc).attr("disabled", true)
            } else {
                $(pc).attr("disabled", false)
                $(pc).attr("list", "slot" + si);
                $(pc).attr("placeholder", `【${si}】`);
            }
            //检查前面的值 和当前的值 如果不一样则清空 或者先禁用

            let info = getDecorationDataByDName(orgVal);
            if (info && si >= info["slot"]) {
                $(pc).val(orgVal);
            } else {
                $(pc).val("");
            }
            $(pc).trigger("change");
        }
    }
    refreshShowArmorData();
}


function slot_simplify(armor_data) {
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

        for (let partIdx in CurData.partMap) {
            let data = CurData.partMap[partIdx];
            if (data) {
                //更新装备上的显示数据
                render_armor_slot(partIdx, data);
                render_armor_def(partIdx, data);
                render_armor_skill(partIdx, data["eq_k_skill"]);
                render_armor_cost(partIdx, data);
            }
        }
        render_total_table();
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
    let curName = CurData.name || TmpCacheName;
    CurData.name = curName;
    PartMapObj[curName] = CurData;

    for (let i = 0; i < PartMapAry.length; i++) {
        let name = PartMapAry[i];
        if (curName == name) {
            PartMapAry.splice(i, 1);
        }
    }
    PartMapAry.unshift(curName);

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
        let allSame = (d["vm"].length == 1);
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
        th = th + `<th class="small"> <button type="button" class="btn btn-secondary switch_to_cache">${name}/会心${cri} <span class="badge text-bg-danger remove_compare" title="从比较列表中移除" name="${name}">x</span></button></th>`
    }
    document.getElementById("skill_table_head").innerHTML = th;
    document.getElementById("skill_table").innerHTML = tb;
    zipSame();

    function doRender(ptr, isSet) {
        // 【修复点 4】：增加兜底的空对象检查
        if (!ptr) return; 

        let name = ptr.name;
        let defTotal = { "p": 0, "f": 0, "w": 0, "t": 0, "i": 0, "d": 0 };
        let tt = ["p", "f", "w", "t", "i", "d"];
        let pnn = ["头", "身", "手", "腰", "腿", "护石", "武器"];
        let skillMap = {};
        for (let partIdx in ptr.partMap) {
            let data = ptr.partMap[partIdx];
            if (!data) continue;
            if (!data) data = {};
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
            $(".skill_info_btn").attr("disabled", true);
        }
        if (ptr.charmData.skill1Lv) {
            let hex = ptr.charmData.skill1Hex;
            if (!skillMap[hex]) {
                skillMap[hex] = buildRenderData(hex)
            }
            skillMap[hex][6] = skillMap[hex][6] + ptr.charmData.skill1Lv;
            skillMap[hex][8] = skillMap[hex][8] + ptr.charmData.skill1Lv;
        }
        if (ptr.charmData.skill2Lv) {
            let hex = ptr.charmData.skill2Hex;
            if (!skillMap[hex]) {
                skillMap[hex] = buildRenderData(hex)
            }
            skillMap[hex][6] = skillMap[hex][6] + ptr.charmData.skill2Lv;
            skillMap[hex][8] = skillMap[hex][8] + ptr.charmData.skill2Lv;
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
                    "map": {}
                };
            }

            let rs = getRateByHex(hex, cur < max ? cur : max);
            if (rs && rs.r) {
                criticalSum = criticalSum + rs.r;
                critical.push(`${rs.r}(${sn})`);
            }
            allSkillMap[hex]["map"][name] = getProgressbar(cur, max);
            if (!allSkillMap[hex]["vm"].includes(cur)) {
                allSkillMap[hex]["vm"].push(cur);
            }

            if (isSet) {
                $("#skill_info_" + hex).attr("disabled", false);
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

    document.getElementById("template_result").innerText = str;
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
    if (CharmSkillMax) {
        s1Lv = 9;
        s2Lv = 9;
    }
    //注意把等级修改成 9 的话 则会变成最大值
    if (!s) {
        return "";
    }
    let n1 = getSkillNameByHex(s1Hex) || "";
    let n2 = getSkillNameByHex(s2Hex) || "";
    let title = `[第06格${n1}${s1Lv}_${n2}${s2Lv}_S${s}]`;
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
    let content = document.getElementById("template_result").innerText;
    navigator.clipboard.writeText(content);
    document.getElementById("copy_result").innerText = "copied!";
}
/*原下载函数 function downloadTxt() {
    let content = document.getElementById("template_result").innerText;
    const blob = new Blob([content], {
        type: "text/plain;charset=utf-8"
    })
    // 根据 blob生成 url链接
    const objectURL = URL.createObjectURL(blob)
    // 创建一个 a 标签Tag
    const aTag = document.createElement('a')
    // 设置文件的下载地址
    aTag.href = objectURL
    // 设置保存后的文件名称
    aTag.download = `${currentVersion.BID}.txt`;
    // 给 a 标签添加点击事件
    aTag.click();

}*/

function downloadTxt() {
    // 读取页面里要保存的文字
    let content = document.getElementById("template_result").innerText;
    const fileName = `${currentVersion.BID}.txt`;

    // Android WebView 环境 → 调用系统「另存为」对话框
    if (window.Android && typeof window.Android.chooseFile === "function") {
        // 每次都会弹出系统保存框，用户自行挑选路径
        window.Android.chooseFile(fileName, content);
    } else {
        // 浏览器 fallback（保留原来的 Blob 下载方式）
        const blob = new Blob([content], {type: "text/plain;charset=utf-8"});
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
            setTimeout(function () {
                $(`.${m}`).remove();
            }, 6000);
            await timeLag(350);
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
        // console.log(d,curLv);
        let r = c["critical"] || 0;
        let s = d["sit"];
        return { r, s };
    }
    return null;
}


function initSkillInfo() {
    // let str = "";

    // let c = ["list-group-item-success", "list-group-item-danger", "list-group-item-primary", "list-group-item-warning", "list-group-item-info", "list-group-item-dark"];
    let c = ["btn-success", "btn-danger", "btn-primary", "btn-warning", "btn-info", "btn-dark"];
    // let idx = 0;
    {/* <button type="button" class="btn btn-primary">Primary</button> */ }
    let s = Object.keys(skill_data);
    s.sort();

    let arrM = {};
    for (let i = 0; i < s.length; i++) {
        let hex = s[i];
        let d = skill_data[hex];
        /*if (isSkipSkill(hex)) {
            continue;
        }*/
        let t = d["tag"][0];
        if (!arrM[t]) {
            arrM[t] = [];

        }
        arrM[t].push([hex, d["sname"]]);
    }
    let ctx = "";
    for (let t in arrM) {
        let a = arrM[t];
        let str = `<div class="m-1 row" title="${t}">${t}</div>`
        let idx = 0;
        for (let i = 0; i < a.length; i++) {
            if (idx == 0) {
                str = str + `<div class="m-1 row" title="${t}">`;
            }
            let hex = a[i][0];
            let name = a[i][1];

            // <button type="button" class="btn btn-secondary" data-bs-toggle="tooltip" data-bs-html="true" data-bs-title="<em>Tooltip</em> <u>with</u> <b>HTML</b>">
            // Tooltip with HTML
            // </button>
            let desc = skill_desc[hex]["desc"] + "\n";
            $(skill_desc[hex]["effect"]).find("li").each(function (idx, elm) {
                desc = desc + $(elm).text() + "\n";

            });
            str = str + `            
            <div class="col col-2 row skill_info_div" title="${desc}");>
            <button type="button" disabled id="skill_info_${hex}" class="skill_info_btn btn  ${c[idx]} rounded">
            <span>${name}</span><span class="skill_info_status">0/0</span>
            </button>            
            </div>
            `
            idx++;
            if (idx == c.length) {
                idx = 0;
                str = str + `</div>`;
            }
        }
        if (idx > 0) {
            str = str + `</div>`;
        }
        ctx = ctx + str;
    }
    // console.log(arrM)
    $("#skillInfo").html(ctx);
}

function clickSkillInfo(id, title) {
    // console.log(id, title);
    if ($("#" + id).hasClass("border")) {
        $("#" + id).removeClass("border");
        $("#" + id).removeClass("border-5");
    } else {
        $("#" + id).addClass("border");
        $("#" + id).addClass("border-5");
    }
}

//上传设置
function uploadSetting() {

}

//下载设置
function downloadSetting() {

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
    //
    // console.log(name);
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
    //
    if (PartMapAry <= 1) {
        return;
    }
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

function parseText(v) {
    v = v.split("\n").join("");
    v = v.split("<string>");
    v.shift()
    // console.log(v);

    //armor
    // for (let i = 0; i < v.length; i++) {
    //     let idx = (300+i)+"_3"
    //     console.log(i,idx,v[i],armor_list[idx]?armor_list[idx]["name"]:"");
    // }

    //skillName
    // for (let i = 0; i < v.length; i++) {
    //     let hex = (parseInt(i)).toString(16);
    //     if (hex.length <= 1) {
    //         hex = "0" + hex;
    //     }
    //     hex=hex.toUpperCase();
    //     console.log(i, hex, v[i], skill_data[hex] ? skill_data[hex]["sname"] : "");
    // }

    //skillDesc1
    // for (let i = 0; i < v.length; i++) {
    //     let hex = (parseInt(i/8)).toString(16);
    //     if (hex.length <= 1) {
    //         hex = "0" + hex;
    //     }
    //     hex=hex.toUpperCase();
    //     //注意拼接 896行有点问题
    //     // if(v[i]=="降低偏移2個階段，<lf>且小幅加長適當距離")console.log(i);
    //     // console.log(i, hex, v[i], skill_data[hex] ? skill_data[hex]["sname"] : "");
    // }

    //skillDesc2
    //36 偏移 2
    // v.shift();
    // //6F 风雷合一 4-5？ 幸运
    // v.shift();
    // v.shift();

    // //25%
    // v.pop()

    // //23 防御 4-7
    // v.pop()
    // v.pop()
    // v.pop()
    // v.pop()

    // //火事场力 2-4
    // v.pop()
    // v.pop()
    // v.pop()

    // //拔刀技 1-3
    // v.pop()
    // v.pop()
    // v.pop()

    // //防御性能 2-5
    // v.pop()
    // v.pop()
    // v.pop()
    // v.pop()

    // //skillDesc2 前3个是补充
    // for (let i = 0; i < v.length; i++) {

    //     let hex = intToHex(112 + parseInt(i / 8));
    //     console.log(i, parseInt(i / 8), hex, skill_data[hex] ? skill_data[hex]["sname"] : "", v[i])
    //     //80 81 合气 7A
    // }

    //skillExplain
    // for (let i = 0; i < v.length; i++) {
    //     let hex = (parseInt(i)).toString(16);
    //     if (hex.length <= 1) {
    //         hex = "0" + hex;
    //     }
    //     hex=hex.toUpperCase();
    //     console.log(i, hex, v[i], skill_data[hex] ? skill_data[hex]["sname"] : "");
    // }
    //skillExplain2
    // / v.pop()
    // v.pop()
    // v.pop()
    // for (let i = 0; i < v.length; i++) {
    //     let hex = (parseInt(112+i)).toString(16);
    //     if (hex.length <= 1) {
    //         hex = "0" + hex;
    //     }
    //     hex = hex.toUpperCase();
    //     console.log(i, hex, v[i], skill_data[hex] ? skill_data[hex]["sname"] : "");
    // }


    //  decoration
    // for (let i = 0; i < v.length; i++) {
    //     let hex = (parseInt(i)).toString(16);
    //     if (hex.length <= 1) {
    //         hex = "0" + hex;
    //     }
    //     hex=hex.toUpperCase();
    //     console.log(i, hex, v[i], skill_data[hex] ? skill_data[hex]["sname"] : "");
    //     // 29 '1D' '' '解放弓的蓄力阶段'
    //     // 83 '53' '' '剥取名人'
    //     // 100 '64' '' '霞皮的恩惠'
    //     // 101 '65' '' '钢壳的恩惠'
    //     // 102 '66' '' '炎鳞的恩惠'
    //     // 103 '67' '' '龙气活性'
    //     // 109 '6D' '' '风纹一致'
    //     // 110 '6E' '' '雷纹一致'
    //     // 111 '6F' '' '风雷合一'


    // }

    //  decoration2
    // for (let i = 0; i < v.length; i++) {
    //     let hex = (parseInt("43", 16) + parseInt(i)).toString(16);
    //     if (hex.length <= 1) {
    //         hex = "0" + hex;
    //     }
    //     hex = hex.toUpperCase();
    //     console.log(i, hex, v[i], skill_data[hex] ? skill_data[hex]["sname"] : "");
    //     // 29 '1D' '' '解放弓的蓄力阶段'
    //     // 83 '53' '' '剥取名人'
    //     // 100 '64' '' '霞皮的恩惠'
    //     // 101 '65' '' '钢壳的恩惠'
    //     // 102 '66' '' '炎鳞的恩惠'
    //     // 103 '67' '' '龙气活性'
    //     // 109 '6D' '' '风纹一致'
    //     // 110 '6E' '' '雷纹一致'
    //     // 111 '6F' '' '风雷合一'


    // }

    for (let i = 0; i < v.length; i++) {
        let idx = 109 + i + "";
        // console.log(i, idx, v[i], decoration_data[idx] ? decoration_data[idx]["dname"] : "");
        // 29 '1D' '' '解放弓的蓄力阶段'
        // 83 '53' '' '剥取名人'
        // 100 '64' '' '霞皮的恩惠'
        // 101 '65' '' '钢壳的恩惠'
        // 102 '66' '' '炎鳞的恩惠'
        // 103 '67' '' '龙气活性'
        // 109 '6D' '' '风纹一致'
        // 110 '6E' '' '雷纹一致'
        // 111 '6F' '' '风雷合一'


    }

}

// parseText(A_Arm_Name_MR);
// parseText(PlayerSkill_Name);
// parseText(PlayerSkill_Detail);
// parseText(PlayerSkill_Detail2);

// parseText(PlayerSkill_Explain);
// parseText(PlayerSkill_Explain2);

// parseText(Decorations_Name);
parseText(Decorations_Name2);