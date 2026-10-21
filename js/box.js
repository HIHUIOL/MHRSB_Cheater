/* ============================================================
 * box.js —— 装备箱内存读取（MHRSB 16.0.2 实测）
 *
 * 依赖：bridge.js（Bridge.cmd）、memory.js（Mem.*）
 * 结构详见 .ai-memory/MEMORY_MAP.md
 *
 * 【铁律】peek/poke 是原始字节序，读写 u32/u64 必须反转字节
 * ============================================================ */
var Box = (function () {

    // 容器表指针链：main+0x12B157C0 → +0x88 → +0x28 → +0x10
    var CHAIN = [
        { type: 'main', off: 0x12B157C0 },
        { type: 'ptr',  off: 0x88 },
        { type: 'ptr',  off: 0x28 },
        { type: 'ptr',  off: 0x10 }
    ];

    // 数组起始偏移 & 容量
    var ARRAY_BASE = 0x20;
    var CAPACITY = 5000;

    // 节点内字段偏移
    var NODE_TYPE = 0x30;
    var NODE_ID   = 0x34;

    // 物品类型
    var T_EMPTY = 0, T_WEAPON = 1, T_ARMOR = 2, T_CHARM = 3;

    var PART_NAMES = { 1: '头', 2: '胸', 3: '腕', 4: '腰', 5: '腿' };

    // 当前配装在数组里占前 6 位
    var SLOT_EQUIP = [0, 1, 2, 3, 4];   // 位置1~5
    var SLOT_CHARM = 5;                  // 护石
    // 容器表的 5000 格全部都是装备箱格子，从 0 开始
    // （前几格放着「当前穿着的装备」，但它们本来就在箱子里，不是箱子之外的东西）
    var BOX_START = 0;

    var _container = null;  // 缓存容器表基址（同一会话内有效）

    /* ---------- 指针有效性判断 ----------
     * ⚠️【踩坑】早期这里写死了 0x4CAD000000 ~ 0x4D00000000，
     *    那是某次会话的 heap 地址段。游戏重启后 heapBase 会变
     *    （实测变成 0x2DD9400000），写死的范围会把所有有效指针全过滤掉，
     *    表现就是「装备箱读不到，但单格读正常」。
     *    正确做法：用当前 heapBase 动态算范围。
     */
    function isValidPtr(p) {
        if (!p || typeof p !== 'number') return false;
        if (p < 0x100000000) return false;          // 太小，不可能是堆指针
        var hb = (typeof Mem !== 'undefined' && Mem.getHeapBaseSync) ? Mem.getHeapBaseSync() : null;
        if (hb) return (p >= hb && p < hb + 0x40000000);
        return true;                                 // 没有 base 信息时不做范围过滤（宁松勿漏）
    }

    /* ---------- 底层：字节序正确处理 ---------- */

    // 读绝对地址 -> Uint8Array（Mem.readAbs 已返回字节数组）
    async function _readBytes(addr, n) {
        var b = await Mem.readAbs(addr, n);
        if (!b || b.length !== n) return null;
        return b;
    }

    // 读 main 相对偏移 -> Uint8Array
    async function _readMainBytes(off, n) {
        var b = await Mem.peekMain(off, n);
        if (!b || b.length !== n) return null;
        return b;
    }

    /** ⚡ 批量读多段（一次请求读 N 个地址）
     *  实测：50 段只需 128ms，而逐个读要 5320ms（快 41 倍）
     *  addrs: [绝对地址...]  n: 每段字节数
     *  返回: [Uint8Array, ...]（失败的位置为 null）
     */
    async function _peekMulti(addrs, n) {
        if (!addrs || !addrs.length) return [];
        var args = [];
        for (var i = 0; i < addrs.length; i++) {
            args.push('0x' + addrs[i].toString(16).toUpperCase());
            args.push(String(n));
        }
        var resp;
        try {
            resp = await Bridge.cmd('peekAbsoluteMulti ' + args.join(' '));
        } catch (e) {
            // 整批失败，降级为逐个读
            var out0 = [];
            for (var j = 0; j < addrs.length; j++) out0.push(await _readBytes(addrs[j], n));
            return out0;
        }
        var bytes = _hexToBytes(String(resp || '').trim());
        var out = [];
        for (var k = 0; k < addrs.length; k++) {
            var o = k * n;
            if (o + n <= bytes.length) out.push(bytes.subarray(o, o + n));
            else out.push(null);
        }
        return out;
    }

    // Uint8Array(小端) -> u32
    function _u32(b) {
        if (!b || b.length < 4) return null;
        return (b[3] << 24 | b[2] << 16 | b[1] << 8 | b[0]) >>> 0;
    }

    // Uint8Array(小端) -> 数值（Switch 地址 48 位，用 Number 足够精确）
    function _u64(b) {
        if (!b || b.length < 8) return null;
        var lo = (b[3] << 24 | b[2] << 16 | b[1] << 8 | b[0]) >>> 0;
        var hi = (b[7] << 24 | b[6] << 16 | b[5] << 8 | b[4]) >>> 0;
        return hi * 0x100000000 + lo;
    }

    // 读 u32（绝对地址）
    async function _readU32(addr) {
        return _u32(await _readBytes(addr, 4));
    }

    // 读 u64（绝对地址）
    async function _readU64(addr) {
        return _u64(await _readBytes(addr, 8));
    }

    // 读 u64（main 相对偏移）
    async function _readU64Main(off) {
        return _u64(await _readMainBytes(off, 8));
    }

    function _hexToBytes(hex) {
        hex = String(hex || '').replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '');
        if (hex.length % 2) hex = '0' + hex;
        var out = new Uint8Array(hex.length / 2);
        for (var i = 0; i < out.length; i++) {
            out[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return out;
    }

    function _bytesToHex(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i++) {
            s += bytes[i].toString(16).padStart(2, '0');
        }
        return s;
    }

    /* ---------- 容器表 ---------- */

    // 走指针链拿到容器表基址
    async function getContainer(force) {
        if (_container && !force) return _container;

        // 第 1 跳：main 相对偏移（peekMain）
        var addr = await _readU64Main(CHAIN[0].off);
        if (!addr) return null;

        // 后续跳：从上一个地址解引用
        for (var i = 1; i < CHAIN.length; i++) {
            addr = await _readU64(addr + CHAIN[i].off);
            if (!addr) return null;
        }

        _container = addr;
        return addr;
    }

    // 清除缓存（游戏重启 / 切图后要重取）
    function reset() {
        _container = null;
    }

    /* ---------- 数组访问 ---------- */

    // 拿第 N 项的节点地址
    async function getNodeAddr(n) {
        var c = await getContainer();
        if (!c) return null;
        return await _readU64(c + ARRAY_BASE + n * 8);
    }

    // 【批量】一次性读出整个指针数组
    // 5000×8 = 40000 字节，按 20000 分 2 次读（sys-agent 单次上限 22016 字符，够安全）
    // 返回 { ptrs: Number[], count: number, raw: Uint8Array }
    async function loadPointerTable(opts) {
        opts = opts || {};
        var cap = opts.capacity || CAPACITY;
        var c = await getContainer();
        if (!c) return null;

        var total = cap * 8;
        var CHUNK = 20000;
        var bytes = new Uint8Array(total);
        var got = 0;

        while (got < total) {
            var len = Math.min(CHUNK, total - got);
            var piece = await Mem.readRange(c + ARRAY_BASE + got, len);
            if (!piece || !piece.length) break;
            bytes.set(piece.subarray(0, Math.min(piece.length, len)), got);
            if (piece.length < len) { got += piece.length; break; }
            got += len;
        }

        var ptrs = [];
        var n = Math.floor(got / 8);
        for (var i = 0; i < n; i++) {
            var o = i * 8;
            var lo = (bytes[o + 3] << 24 | bytes[o + 2] << 16 | bytes[o + 1] << 8 | bytes[o]) >>> 0;
            var hi = (bytes[o + 7] << 24 | bytes[o + 6] << 16 | bytes[o + 5] << 8 | bytes[o + 4]) >>> 0;
            ptrs.push(hi * 0x100000000 + lo);
        }
        return { ptrs: ptrs, count: n };
    }

    // 【批量】读一组节点的 type/id
    // ⚡ 核心优化：用 sys-agent 的 peekAbsoluteMulti，一条命令读多段
    //    实测 1400 段 / 850ms；1500 段会超时（sys-agent 单行上限 22016 字符，
    //    每段 "0xADDR 8" 约 21 字符 → 安全上限 ~1048 段，这里取 1000）
    // nodes: [{index, node}]
    // 返回: [{index, node, type, id, empty}]
    async function readNodes(nodes, opts) {
        opts = opts || {};
        var onProgress = opts.onProgress;
        var CHUNK = opts.chunk || 1000;

        if (!nodes.length) return [];

        var out = [];

        for (var s = 0; s < nodes.length; s += CHUNK) {
            var part = nodes.slice(s, s + CHUNK);

            var args = [];
            for (var k = 0; k < part.length; k++) {
                args.push('0x' + (part[k].node + NODE_TYPE).toString(16).toUpperCase());
                args.push('8');
            }
            var cmd = 'peekAbsoluteMulti ' + args.join(' ');

            var resp;
            try {
                resp = await Bridge.cmd(cmd);
            } catch (e) {
                // 整批失败：逐个降级为单条读（保证不丢数据）
                for (var d = 0; d < part.length; d++) {
                    var single = await get(part[d].index);
                    if (single) out.push(single);
                }
                continue;
            }

            var hex = String(resp || '').trim();
            var bytes = _hexToBytes(hex);

            for (var j = 0; j < part.length; j++) {
                var o = j * 8;
                if (o + 8 > bytes.length) break;
                var type = _u32(bytes.subarray(o, o + 4));
                var id = _u32(bytes.subarray(o + 4, o + 8));
                out.push({
                    index: part[j].index,
                    node: part[j].node,
                    type: type,
                    id: id,
                    empty: (type === T_EMPTY && id === 0)
                });
            }

            if (onProgress) onProgress(Math.min(s + part.length, nodes.length), nodes.length);
        }

        out.sort(function (a, b) { return a.index - b.index; });
        return out;
    }

    // 读第 N 项（返回 {index, node, type, id, empty}）
    async function get(n) {
        var node = await getNodeAddr(n);
        if (!node) return null;

        var type = await _readU32(node + NODE_TYPE);
        var id   = await _readU32(node + NODE_ID);
        if (type === null || id === null) return null;

        return {
            index: n,
            node: node,
            type: type,
            id: id,
            empty: (type === T_EMPTY && id === 0)
        };
    }

    /* ---------- 当前配装（前 6 项） ---------- */

    // 读当前穿着的 5 件 + 护石
    async function getEquipped() {
        var out = { equip: [], charm: null };
        for (var i = 0; i < SLOT_EQUIP.length; i++) {
            var e = await get(SLOT_EQUIP[i]);
            out.equip.push(e);
        }
        out.charm = await get(SLOT_CHARM);
        return out;
    }

    /* ---------- 装备箱（整个 5000 格） ---------- */

    // 统计有效件数
    // ⚠️ 不能用「连续空槽就停」——格子可以任意留空，那样会少算
    //    直接复用 listAll 的结果
    async function count(opts) {
        opts = opts || {};
        var items = await listAll(opts);
        return items.length;
    }

    // 列出箱子全部有效件
    // ✅ 默认扫完整个指针表（5000 格），不猜结束位置
    //    原因：装备箱的槽位可以被任意留空（第1格放一件、第5000格放一件，中间全空是合法的），
    //    所以「遇到连续 N 个空槽就停」会漏数据。
    //    实测全量 5000 项 ≈ 3.7 秒（5 批 peekAbsoluteMulti）。
    async function listAll(opts) {
        opts = opts || {};
        var limit = opts.limit || CAPACITY;
        var onProgress = opts.onProgress;

        var table = await loadPointerTable({ capacity: Math.min(limit + BOX_START, CAPACITY) });
        if (!table) return [];

        var nodes = [];
        for (var i = BOX_START; i < table.count; i++) {
            var p = table.ptrs[i];
            if (!isValidPtr(p)) continue;
            nodes.push({ index: i, node: p });
            if (nodes.length >= limit) break;
        }
        if (!nodes.length) return [];

        var items = await readNodes(nodes, { onProgress: onProgress });

        var out = [];
        for (var k = 0; k < items.length; k++) {
            if (!items[k].empty) out.push(items[k]);
        }
        out.sort(function (a, b) { return a.index - b.index; });
        return out;
    }

    // 【渐进】分批列出：每读完一批回调一次，UI 边读边渲染
    // 同样扫完整个表，不做提前终止
    // opts.onBatch(items, isFirst, totalCount) 必传
    async function listAllProgressive(opts) {
        opts = opts || {};
        var limit = opts.limit || CAPACITY;
        var batchSize = opts.batchSize || 1000;
        var onBatch = opts.onBatch;

        var table = await loadPointerTable({ capacity: Math.min(limit + BOX_START, CAPACITY) });
        if (!table) return [];

        var nodes = [];
        for (var i = BOX_START; i < table.count; i++) {
            var p = table.ptrs[i];
            if (!isValidPtr(p)) continue;
            nodes.push({ index: i, node: p });
            if (nodes.length >= limit) break;
        }
        if (!nodes.length) return [];

        var all = [];
        var first = true;

        for (var s = 0; s < nodes.length; s += batchSize) {
            var chunk = nodes.slice(s, s + batchSize);
            var got = await readNodes(chunk);

            var trimmed = [];
            for (var k = 0; k < got.length; k++) {
                if (!got[k].empty) { trimmed.push(got[k]); all.push(got[k]); }
            }
            if (onBatch) onBatch(trimmed, first, all.length);
            first = false;
        }
        return all;
    }

    /* ---------- 单个装备详情（仅读取，不写入） ---------- */

    // 节点内已知的指针字段（实测 2026-10-20）
    var PTR_SKILL   = 0xA0;   // 技能块（7 槽 × 8 指针）
    var PTR_KANSEI  = 0xB0;   // ★ 怪异练成块（推测）
    var PTR_KANSEI2 = 0xC0;   // 怪异练成子块（推测）

    // 技能块内：7 个槽指针的起始偏移
    var SKILL_SLOTS = [0x20, 0x28, 0x30, 0x38, 0x40, 0x48, 0x50];

    // 读一件装备的完整详情（全部是原始数据，不做任何语义猜测）
    async function getDetail(index) {
        var item = await get(index);
        if (!item) return null;

        var node = item.node;
        var info = parseId(item.type, item.id);

        // ① 节点前 0x220 字节
        var nodeBytes = await _readBytes(node, 0x220);
        var nodeDump = nodeBytes ? _bytesToHex(nodeBytes) : null;

        // ② 技能块
        var skill = null;
        var pSkill = nodeBytes ? _u64(nodeBytes.subarray(PTR_SKILL, PTR_SKILL + 8)) : 0;
        if (isValidPtr(pSkill)) {
            var blk = await _readBytes(pSkill, 0x60);
            var slots = [];
            if (blk) {
                for (var i = 0; i < SKILL_SLOTS.length; i++) {
                    var off = SKILL_SLOTS[i];
                    var sp = _u64(blk.subarray(off, off + 8));
                    var slotInfo = { i: i + 1, ptr: sp };
                    if (isValidPtr(sp)) {
                        var sd = await _readBytes(sp, 0x20);
                        if (sd) {
                            slotInfo.hex = _bytesToHex(sd);
                            slotInfo.u16_08 = sd[1] << 8 | sd[0];
                            slotInfo.u16_0A = sd[3] << 8 | sd[2];
                            slotInfo.u16_0C = sd[5] << 8 | sd[4];
                            slotInfo.u16_0E = sd[7] << 8 | sd[6];
                            slotInfo.u32_10 = _u32(sd.subarray(0x10, 0x14));
                            slotInfo.u32_14 = _u32(sd.subarray(0x14, 0x18));
                            slotInfo.u32_18 = _u32(sd.subarray(0x18, 0x1C));
                            slotInfo.u32_1C = _u32(sd.subarray(0x1C, 0x20));
                        }
                    }
                    slots.push(slotInfo);
                }
            }
            skill = {
                ptr: '0x' + pSkill.toString(16).toUpperCase(),
                dump: blk ? _bytesToHex(blk) : null,
                slots: slots
            };
        }

        // ③ 怪异练成块（原样 dump，不做解释）
        async function readBlock(off) {
            if (!nodeBytes) return null;
            var p = _u64(nodeBytes.subarray(off, off + 8));
            if (!isValidPtr(p)) return null;
            var b = await _readBytes(p, 0x60);
            if (!b) return null;
            return {
                ptr: '0x' + p.toString(16).toUpperCase(),
                dump: _bytesToHex(b),
                u16_0C: b[0x0D] << 8 | b[0x0C],
                u32_10: _u32(b.subarray(0x10, 0x14)),
                u32_14: _u32(b.subarray(0x14, 0x18)),
                u32_18: _u32(b.subarray(0x18, 0x1C)),
                u32_1C: _u32(b.subarray(0x1C, 0x20)),
                u32_20: _u32(b.subarray(0x20, 0x24)),
                u32_24: _u32(b.subarray(0x24, 0x28)),
                u32_28: _u32(b.subarray(0x28, 0x2C)),
                u32_2C: _u32(b.subarray(0x2C, 0x30))
            };
        }

        var kansei = await readBlock(PTR_KANSEI);
        var kansei2 = await readBlock(PTR_KANSEI2);

        return {
            index: index,
            node: '0x' + node.toString(16).toUpperCase(),
            type: item.type,
            id: item.id,
            idHex: '0x' + (item.id >>> 0).toString(16).toUpperCase().padStart(8, '0'),
            kind: info.kind,
            part: info.part,
            partName: info.partName,
            itemId: info.itemId,
            name: displayName(item),
            armor: findArmor(info),
            nodeDump: nodeDump,
            skill: skill,
            kansei: kansei,
            kansei2: kansei2
        };
    }

    // 解析物品 ID
    // 防具: 0C{部位}0{ID:04X}  武器: 08{X}0{ID:04X}  护石: type=3
    function parseId(type, id) {
        var hex = (id >>> 0).toString(16).toUpperCase().padStart(8, '0');
        var out = {
            raw: hex,
            kind: 'unknown',
            part: 0,
            partName: '',
            itemId: 0
        };

        if (type === T_ARMOR && (id >>> 24) === 0x0C) {
            out.kind = 'armor';
            out.part = (id >>> 20) & 0xF;
            out.partName = PART_NAMES[out.part] || '?';
            out.itemId = id & 0xFFFF;
        } else if (type === T_WEAPON) {
            out.kind = 'weapon';
            out.category = (id >>> 16) & 0xFFFF;   // 0x8D0=重弩, 0x8F0=绿金龟
            out.itemId = id & 0xFFFF;
        } else if (type === T_CHARM) {
            out.kind = 'charm';
            out.itemId = id;
        }

        return out;
    }

    // 防具 ID → armor_list 条目（必须 id + parts_id 联合查询）
    function findArmor(info) {
        if (!info || info.kind !== 'armor') return null;
        if (typeof armor_list === 'undefined') return null;
        var key = info.itemId + '_' + info.part;
        return armor_list[key] || null;
    }

    // 拿显示名
    function displayName(item) {
        if (!item) return '';
        if (item.empty) return '（空）';
        var info = parseId(item.type, item.id);
        if (info.kind === 'armor') {
            var a = findArmor(info);
            if (a) return a.name;
            return '防具 0x' + info.raw + '（下表未收录）';
        }
        if (info.kind === 'weapon') {
            return '武器 0x' + info.raw;
        }
        if (info.kind === 'charm') {
            return '护石 0x' + info.raw;
        }
        return '未知 0x' + info.raw;
    }

    /* ---------- 护石技能读取（实测 2026-10-20，2026-10-20 二次核对修正顺序） ----------
     * 护石节点结构（与防具完全不同，不走 +0xA0 技能块）：
     *   +0x30 : u32 类型(3)  +0x34 : u32 物品ID
     *   +0x80 : u64 → 技能块，块+0x20 处：
     *             byte[0] = 技能1 hex   ← 游戏内排在【上面】的那个
     *             byte[1] = 技能2 hex   ← 游戏内排在【下面】的那个
     *   +0x88 : u64 → 等级块，块+0x20 处：
     *             u32@+0x00 = 技能1 等级
     *             u32@+0x04 = 技能2 等级
     *   +0x78 : u64 → 孔位块，块+0x20 处：
     *             3 对 u32（共 0x18 字节）
     *
     * ⚠️ 配对铁律：byte[0] 必须和 u32@0 配对，byte[1] 必须和 u32@4 配对。
     *    反证证据（装备箱格 60）：byte0=0x31 贯通弹·贯通箭强化(max=3) 等级 3 ✅
     *    若拿 byte1 的等级 4 配它就成了「贯通弹 Lv4」，超过上限，不可能。
     *    格 61 同理：0x88 累积时攻击强化(max=3) 等级 3 ✅。
     */
    function _u16At(b, o) { return (b[o + 1] << 8) | b[o]; }
    function _u32At(b, o) { return ((b[o + 3] << 24) | (b[o + 2] << 16) | (b[o + 1] << 8) | b[o]) >>> 0; }

    /** 孔位 u32[6] → 显示文本（如 "321" / "331" / "222" / ""）
     *  u32[i] = i 级孔的数量，按等级从高到低排列输出
     *  例：[0,1,1,1,0,0] → 1级×1 + 2级×1 + 3级×1 → "321"
     *      [0,1,0,2,0,0] → 1级×1 + 3级×2      → "331"
     *      [0,0,3,0,0,0] → 2级×3              → "222"
     */
    function _slotWordsToText(words) {
        if (!words || !words.length) return '';
        var levels = [];
        for (var lv = 4; lv >= 1; lv--) {
            var n = words[lv] || 0;
            if (n < 0) n = 0;
            if (n > 3) n = 3;
            for (var k = 0; k < n; k++) levels.push(lv);
        }
        if (levels.length > 3) levels = levels.slice(0, 3);
        return levels.join('');
    }

    /** 显示文本（"321" / "331" / "222" / "000"）→ 孔位 u32[6]
     *  返回 [u0..u5]，u0 与 u5 恒为 0
     */
    function _slotTextToWords(text) {
        var words = [0, 0, 0, 0, 0, 0];
        var s = String(text == null ? '' : text).replace(/[^1-4]/g, '');
        for (var i = 0; i < s.length && i < 3; i++) {
            var lv = parseInt(s.charAt(i), 10);
            if (lv >= 1 && lv <= 4) words[lv] += 1;
        }
        return words;
    }

    /** 孔位 u32[6] → 三个孔的等级数组 [孔1, 孔2, 孔3]（0 表示无孔）
     *  孔按等级从高到低排列，与游戏显示顺序一致
     *  例：[0,1,1,1,0,0] → [3,2,1]（"321"）
     *      [0,0,3,0,0,0] → [2,2,2]（"222"）
     *      [0,0,0,0,0,0] → [0,0,0]（无孔）
     */
    function _slotWordsToLevels(words) {
        var levels = [0, 0, 0];
        if (!words || !words.length) return levels;
        var idx = 0;
        for (var lv = 4; lv >= 1 && idx < 3; lv--) {
            var n = words[lv] || 0;
            if (n < 0) n = 0;
            if (n > 3) n = 3;
            for (var k = 0; k < n && idx < 3; k++) levels[idx++] = lv;
        }
        return levels;
    }

    /** 三个孔的等级数组 [孔1, 孔2, 孔3] → 孔位 u32[6]
     *  每个值 0~4，0 表示该孔不存在；非 0 值自动按从高到低排序
     *  例：[3,2,1] → [0,1,1,1,0,0]
     *      [2,0,0] → [0,0,1,0,0,0]
     */
    function _levelsToSlotWords(levels) {
        var words = [0, 0, 0, 0, 0, 0];
        var arr = [];
        for (var i = 0; i < 3; i++) {
            var v = parseInt((levels && levels[i]) || 0, 10);
            if (isNaN(v) || v < 1 || v > 4) continue;   // 0 或非法值 = 无孔
            arr.push(v);
        }
        for (var j = 0; j < arr.length; j++) words[arr[j]] += 1;
        return words;
    }

    /** 读护石数据
     *  返回 { skill1Hex, skill1Lv, skill2Hex, skill2Lv, slotWords:[6个u32], ptrs }
     *  ★ skill1 = 游戏内第一个技能 = 内存 byte[0] / u32@0
     *    skill2 = 游戏内第二个技能 = 内存 byte[1] / u32@4
     */
    async function getCharmData(nodeAddr) {
        if (!nodeAddr) return null;
        var out = {
            skill1Hex: 0, skill1Lv: 0,
            skill2Hex: 0, skill2Lv: 0,
            slotWords: [0, 0, 0, 0, 0, 0],
            ptrs: {}
        };

        // ① 技能 hex：+0x80 → +0x20
        var pSkillBuf = await _readBytes(nodeAddr + 0x80, 8);
        var pSkill = pSkillBuf ? _u64(pSkillBuf.subarray(0, 8)) : 0;
        out.ptrs.skill = '0x' + pSkill.toString(16).toUpperCase();
        if (isValidPtr(pSkill)) {
            var sb = await _readBytes(pSkill + 0x20, 0x10);
            if (sb) {
                out.skill1Hex = sb[0];              // 低字节 = 技能1（游戏内第一个）
                out.skill2Hex = sb[1];              // 第二字节 = 技能2（游戏内第二个）
                out.skillRaw = _bytesToHex(sb);
            }
        }

        // ② 技能等级：+0x88 → +0x20
        var pLvBuf = await _readBytes(nodeAddr + 0x88, 8);
        var pLv = pLvBuf ? _u64(pLvBuf.subarray(0, 8)) : 0;
        out.ptrs.lv = '0x' + pLv.toString(16).toUpperCase();
        if (isValidPtr(pLv)) {
            var lb = await _readBytes(pLv + 0x20, 0x10);
            if (lb) {
                out.skill1Lv = _u32At(lb, 0);       // u32@0 = 技能1 等级
                out.skill2Lv = _u32At(lb, 4);       // u32@4 = 技能2 等级
                out.lvRaw = _bytesToHex(lb);
            }
        }

        // ③ 孔位：+0x78 → +0x20（24 字节 = 6 个 u32）
        // ★ 编码规则（2026-10-20 实测确认，格 62/63/64/66/81 五点验证）：
        //   u32[i] = i 级孔的数量（i=1..4；u32[0] 与 u32[5] 恒为 0，未使用）
        //   例：u1=1,u2=1,u3=1 → "321"（1级1个+2级1个+3级1个）
        //       u1=1,u3=2       → "331"
        //       u2=3            → "222"
        //       全零            → 无孔
        var pSlotBuf = await _readBytes(nodeAddr + 0x78, 8);
        var pSlot = pSlotBuf ? _u64(pSlotBuf.subarray(0, 8)) : 0;
        out.ptrs.slot = '0x' + pSlot.toString(16).toUpperCase();
        if (isValidPtr(pSlot)) {
            var sl = await _readBytes(pSlot + 0x20, 0x18);
            if (sl) {
                out.slotWords = [0, 4, 8, 0xC, 0x10, 0x14].map(function (o) { return _u32At(sl, o); });
                out.slotRaw = _bytesToHex(sl);
                out.slotText = _slotWordsToText(out.slotWords);
            }
        }

        return out;
    }

    /* ---------- 写：向装备箱格子添加装备/护石（2026-10-20） ----------
     * 依据主页金手指 genCharmTemplate 推导，公式已交叉验证：
     *   格号 → 容器表偏移 = 0x20 + (格号 - 1) × 8
     *
     * 防具：+0x30=ID, +0x34=2(防具), +0xA0→技能块 7 槽各 +0x10/+0x18 清零
     * 护石：+0x30=ID, +0x34=3(护石),
     *       +0x80→块+0x20 byte0=技能1, byte1=技能2
     *       +0x88→块+0x20 u32@0=技能1Lv, u32@4=技能2Lv
     *       +0x78→块+0x20 u32[i]=i级孔数量
     */

    // 格号 → 容器表里该格的指针（0 基索引）
    function gridToOffset(gridNo) {
        return ARRAY_BASE + (gridNo - 1) * 8;
    }

    /** 找第一个空格子的格号（1 基），找不到返回 0
     *  ⚠️ 默认扫全部 5000 格。不要传 500/600 这种小值——实测第 601 格就是空的，
     *     限制在前 N 格会误判「箱子满了」。
     *  ⚡ 直接复用 findEmptyGrids：内部按批读，不会撞 peekAbsoluteMulti 的 22016 字符上限。
     *     （旧实现把所有格塞进一条命令，超过上限会被 sys-agent 整条丢弃，永远返回 0）
     */
    async function findFirstEmptyGrid(limit) {
        var r = await findEmptyGrids(1, 1, limit || CAPACITY);
        return (r.grids && r.grids.length) ? r.grids[0] : 0;
    }

    /** 批量找出从 startGrid 开始的连续空格的格号列表（1 基）
     *  ⚡ 一次性读完，避免「每格一次请求」——那是导入慢的根因
     *  返回 { grids: [格号...], exhausted: bool }
     */
    async function findEmptyGrids(count, startGrid, limit) {
        count = count || 1;
        startGrid = startGrid || 1;
        limit = limit || CAPACITY;

        var tab = await loadPointerTable({ capacity: Math.min(limit, CAPACITY) });
        if (!tab || !tab.count) return { grids: [], exhausted: false };

        var grids = [];
        var cursor = Math.max(0, startGrid - 1);   // 0 基索引

        // 分批读：一次取一批候选，挑出空格；不够就继续往后取
        var BATCH = Math.max(200, count * 4);
        while (grids.length < count && cursor < tab.count) {
            var nodes = [];
            for (var i = cursor; i < tab.count && nodes.length < BATCH; i++) {
                var p = tab.ptrs[i];
                if (!isValidPtr(p)) continue;      // 指针无效 = 该格不可用
                nodes.push({ index: i, node: p });
            }
            if (!nodes.length) break;
            cursor = nodes[nodes.length - 1].index + 1;

            var items = await readNodes(nodes);
            for (var k = 0; k < items.length; k++) {
                if (items[k].empty) {
                    grids.push(items[k].index + 1);   // 格号 = 索引 + 1
                    if (grids.length >= count) break;
                }
            }
        }
        return { grids: grids, exhausted: grids.length < count };
    }

    /** 判断某格是否为空（type=0 且 id=0）
     *  ⚠️ 单格用；批量请用 findEmptyGrids（快很多）
     */
    async function isGridEmpty(gridNo) {
        if (!gridNo || gridNo < 1) return false;
        var c = await getContainer();
        if (!c) return false;
        var node = await _readU64(c + gridToOffset(gridNo));
        if (!node) return false;
        // 指针无效 = 该格不存在，不能写
        if (!isValidPtr(node)) return false;
        var type = await _readU32(node + NODE_TYPE);
        var id = await _readU32(node + NODE_ID);
        return (type === T_EMPTY && id === 0);
    }

    /** 写一个装备节点
     *  opts = {
     *    gridNo: 格号（1 基）,
     *    kind: 'armor' | 'charm',
     *    id: 物品 ID（数字）,
     *    // 防具：skills = [{hex, skillHex}] 最多 7 条，写进 +0xA0 技能块
     *    skills: [],
     *    // 护石：skill1Hex/skill1Lv/skill2Hex/skill2Lv/slotLevels=[孔1,孔2,孔3]
     *    skill1Hex, skill1Lv, skill2Hex, skill2Lv, slotLevels
     *  }
     */
    async function addItem(opts) {
        if (!opts || !opts.gridNo) throw new Error('缺少格号');
        var gridNo = opts.gridNo;
        var c = await getContainer();
        if (!c) throw new Error('容器表未就绪');

        var node = await _readU64(c + gridToOffset(gridNo));
        if (!isValidPtr(node)) {
            throw new Error('第 ' + gridNo + ' 格没有节点（指针无效）');
        }

        // ⚡ 优化：把「安全检查 + 各块指针」合成一次 peekAbsoluteMulti
        //    原来每读一个字段就要 104ms，这里一次拿全
        var pSkill = 0, pLv = 0, pSlot = 0, pArmorSkill = 0;
        if (opts.kind === 'charm') {
            var multi = await _peekMulti([
                node + NODE_TYPE,        // +0x30 type+id (8B)
                node + 0x80,             // 技能块指针
                node + 0x88,             // 等级块指针
                node + 0x78              // 孔位块指针
            ], 8);
            var b0 = multi[0], b1 = multi[1], b2 = multi[2], b3 = multi[3];
            var curType = _u32(b0), curId = _u32(b0.subarray(4, 8));
            if (!(curType === T_EMPTY && curId === 0)) {
                throw new Error('第 ' + gridNo + ' 格已有内容（type=' + curType + ' id=0x' +
                                (curId >>> 0).toString(16).toUpperCase() + '），不能覆盖');
            }
            pSkill = _u64(b1); pLv = _u64(b2); pSlot = _u64(b3);
        } else {
            var multi2 = await _peekMulti([
                node + NODE_TYPE,        // +0x30 type+id
                node + 0xA0              // 防具技能块指针
            ], 8);
            var c0 = multi2[0], c1 = multi2[1];
            var cType = _u32(c0), cId = _u32(c0.subarray(4, 8));
            if (!(cType === T_EMPTY && cId === 0)) {
                throw new Error('第 ' + gridNo + ' 格已有内容（type=' + cType + ' id=0x' +
                                (cId >>> 0).toString(16).toUpperCase() + '），不能覆盖');
            }
            pArmorSkill = _u64(c1);
        }

        var log = [];

        // ① 写类型 + ID
        var typeVal = (opts.kind === 'charm') ? T_CHARM : T_ARMOR;
        var idVal = (opts.id >>> 0);
        var head = new Uint8Array(8);
        head[0] = typeVal & 0xFF; head[1] = (typeVal >>> 8) & 0xFF;
        head[2] = (typeVal >>> 16) & 0xFF; head[3] = (typeVal >>> 24) & 0xFF;
        head[4] = idVal & 0xFF; head[5] = (idVal >>> 8) & 0xFF;
        head[6] = (idVal >>> 16) & 0xFF; head[7] = (idVal >>> 24) & 0xFF;
        await Mem.writeAbs(node + NODE_TYPE, head);
        log.push('类型=' + typeVal + '，ID=0x' + idVal.toString(16).toUpperCase());

        if (opts.kind === 'charm') {
            // ② 技能 hex：+0x80 → 块+0x20
            if (!pSkill) throw new Error('护石技能块指针为空');
            var s1 = (opts.skill1Hex || 0) & 0xFF;
            var s2 = (opts.skill2Hex || 0) & 0xFF;
            await Mem.writeAbs(pSkill + 0x20, new Uint8Array([s1, s2, 0, 0, 0, 0, 0, 0]));
            log.push('技能1=0x' + s1.toString(16).toUpperCase() + ' 技能2=0x' + s2.toString(16).toUpperCase());

            // ③ 等级：+0x88 → 块+0x20
            if (!pLv) throw new Error('护石等级块指针为空');
            var l1 = (opts.skill1Lv || 0) >>> 0;
            var l2 = (opts.skill2Lv || 0) >>> 0;
            var lb = new Uint8Array(8);
            lb[0] = l1 & 0xFF; lb[1] = (l1 >>> 8) & 0xFF; lb[2] = (l1 >>> 16) & 0xFF; lb[3] = (l1 >>> 24) & 0xFF;
            lb[4] = l2 & 0xFF; lb[5] = (l2 >>> 8) & 0xFF; lb[6] = (l2 >>> 16) & 0xFF; lb[7] = (l2 >>> 24) & 0xFF;
            await Mem.writeAbs(pLv + 0x20, lb);
            log.push('等级 技能1=' + l1 + ' 技能2=' + l2);

            // ④ 孔位：+0x78 → 块+0x20
            var pSlot = await _readU64(node + 0x78);
            if (!pSlot) throw new Error('护石孔位块指针为空');
            var words = _levelsToSlotWords(opts.slotLevels || [0, 0, 0]);
            var sb = new Uint8Array(0x18);
            for (var wi = 0; wi < 6; wi++) {
                var wv = words[wi] >>> 0;
                sb[wi * 4] = wv & 0xFF; sb[wi * 4 + 1] = (wv >>> 8) & 0xFF;
                sb[wi * 4 + 2] = (wv >>> 16) & 0xFF; sb[wi * 4 + 3] = (wv >>> 24) & 0xFF;
            }
            await Mem.writeAbs(pSlot + 0x20, sb);
            log.push('孔位=' + (_slotWordsToText(words) || '无孔'));
        } else {
            // ② 防具：+0xA0 技能块的 7 个槽
            //    ⚡ 优化：7 个槽指针一次读完；写入也因为槽地址连续（间隔 0x20）合成一次
            //
            // 【槽结构（实测 + 对照 k_skill_add 验证，2026-10-20）】
            //   +0x00 u64 = 槽自指针（不能动）
            //   +0x08 u32 = 固定 2
            //   +0x10 u32 = ★ 词条 hex（0x93=技能+1, 0x8C=孔位+2, 0x3B=防御-6 …）
            //   +0x18 u32 = ★ 技能 hex（0x16/0x0A/0x6A/0x8B … 具体技能）
            //   ⚠️ 曾误判为 +0x0E/+0x10，实测纠正：+0x0E 是无关字段，别碰
            if (!pArmorSkill) throw new Error('防具技能块指针为空');
            var skills = opts.skills || [];

            // 一次读出 7 个槽指针
            var slotAddrs = [];
            for (var si0 = 0; si0 < 7; si0++) slotAddrs.push(pArmorSkill + 0x20 + si0 * 8);
            var slotBufs = await _peekMulti(slotAddrs, 8);
            var slotPtrs = [];
            for (var sj = 0; sj < 7; sj++) slotPtrs.push(_u64(slotBufs[sj]));

            // 判断槽是否连续（间隔 0x20）→ 连续才能合并成一次写
            var contiguous = true;
            var base = 0;
            for (var sk0 = 0; sk0 < 7; sk0++) {
                if (!isValidPtr(slotPtrs[sk0])) { contiguous = false; break; }
                if (sk0 === 0) base = slotPtrs[0];
                else if (slotPtrs[sk0] !== base + sk0 * 0x20) { contiguous = false; break; }
            }

            if (contiguous) {
                // ⚡ 一次写完整块：从首槽 +0x10 到第7槽 +0x1B（覆盖词条hex和技能hex两个u32）
                //    先读回原内容，只改这两个字段，指针和固定值原样保留
                var spanStart = base + 0x10;
                var spanLen = 6 * 0x20 + 0x0C;         // 到第7槽的 +0x1B 结束
                var raw = await Mem.readAbs(spanStart, spanLen);
                if (!raw || raw.length !== spanLen) {
                    contiguous = false;                 // 读不到就降级
                } else {
                    for (var si = 0; si < 7; si++) {
                        var off = si * 0x20;             // 相对 spanStart
                        var sk = skills[si];
                        var hexV = (sk && sk.hex) ? (parseInt(sk.hex, 16) || 0) : 0;
                        var skillV = (sk && sk.skillHex) ? (parseInt(sk.skillHex, 16) || 0) : 0;
                        // +0x10 词条 hex（u32）
                        raw[off + 0] = hexV & 0xFF;
                        raw[off + 1] = (hexV >>> 8) & 0xFF;
                        raw[off + 2] = (hexV >>> 16) & 0xFF;
                        raw[off + 3] = (hexV >>> 24) & 0xFF;
                        // +0x18 技能 hex（u32）—— 相对 spanStart 是 off + 8
                        raw[off + 8] = skillV & 0xFF;
                        raw[off + 9] = (skillV >>> 8) & 0xFF;
                        raw[off + 10] = (skillV >>> 16) & 0xFF;
                        raw[off + 11] = (skillV >>> 24) & 0xFF;
                    }
                    await Mem.writeAbs(spanStart, raw);
                }
            }

            if (!contiguous) {
                // 降级：逐槽写（地址不连续时）
                for (var si2 = 0; si2 < 7; si2++) {
                    var sp = slotPtrs[si2];
                    if (!isValidPtr(sp)) continue;
                    var sk2 = skills[si2];
                    var hexV2 = (sk2 && sk2.hex) ? (parseInt(sk2.hex, 16) || 0) : 0;
                    var skillV2 = (sk2 && sk2.skillHex) ? (parseInt(sk2.skillHex, 16) || 0) : 0;
                    var buf2 = new Uint8Array(0x10);
                    buf2[0] = hexV2 & 0xFF;      // +0x10 词条 hex
                    buf2[8] = skillV2 & 0xFF;    // +0x18 技能 hex
                    await Mem.writeAbs(sp + 0x10, buf2);
                }
            }

            var written = (skills || []).filter(function (x) { return x && x.hex; }).length;
            log.push('词条 ' + written + ' 条' + (contiguous ? '（整块写）' : ''));
        }

        return { gridNo: gridNo, node: node, log: log };
    }

    /* ---------- 导出 ---------- */
    return {
        // 常量
        T_EMPTY: T_EMPTY,
        T_WEAPON: T_WEAPON,
        T_ARMOR: T_ARMOR,
        T_CHARM: T_CHARM,
        BOX_START: BOX_START,
        CAPACITY: CAPACITY,

        // 容器
        getContainer: getContainer,
        reset: reset,

        // 读取
        getNodeAddr: getNodeAddr,
        loadPointerTable: loadPointerTable,
        readNodes: readNodes,
        get: get,
        getDetail: getDetail,
        getCharmData: getCharmData,
        getEquipped: getEquipped,
        count: count,
        listAll: listAll,
        listAllProgressive: listAllProgressive,

        // 解析
        parseId: parseId,
        findArmor: findArmor,
        displayName: displayName,

        // 工具
        hexToBytes: _hexToBytes,
        bytesToHex: _bytesToHex,
        slotWordsToText: _slotWordsToText,
        slotTextToWords: _slotTextToWords,
        slotWordsToLevels: _slotWordsToLevels,
        levelsToSlotWords: _levelsToSlotWords,

        // 写入
        gridToOffset: gridToOffset,
        findFirstEmptyGrid: findFirstEmptyGrid,
        findEmptyGrids: findEmptyGrids,
        isGridEmpty: isGridEmpty,
        addItem: addItem
    };
})();