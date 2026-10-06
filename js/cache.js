class Cache {
    constructor(dbName, tableName, version,) {
        this.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
        this.sessionStorage = window.sessionStorage
        this.store = this.indexedDB || window.localStorage;
        this.dbName = dbName;
        this.version = version;
        this.tableName = tableName;
        this.db = null;
    };
    open() {
        if (!this.store) return;
        if (this.indexedDB) {
            return this.version ? indexedDB.open(this.dbName, this.version) : indexedDB.open(this.dbName)
        } else {
            return window.localStorage
        }
    };
    init() {
        if (!this.store) return;
        let _this = this;
        return new Promise((resolve, reject) => {
            let IDBOpenDBRequest = _this.open()
            if (_this.indexedDB) {
                IDBOpenDBRequest.onupgradeneeded = (e) => {
                    _this.db = e.target.result; // 获取到对应的 IDBDatabase实例。
                    if (!_this.db.objectStoreNames.contains(_this.tableName)) {
                        //如果表格不存在，创建一个新的表格（keyPath，主键）
                        _this.db.createObjectStore(_this.tableName, {
                            keyPath: 'id',
                        });
                    }
                };
                IDBOpenDBRequest.onsuccess = (e) => {
                    _this.db = e.target.result
                    resolve('数据库打开成功')
                };
                IDBOpenDBRequest.onerror = function (e) {
                    reject(e)
                };
            } else {
                _this.db = IDBOpenDBRequest;
                resolve('数据库打开成功')
            }
        })
    };
    //增加数据
    add(key, value) {
        if (!this.db) return;
        let _this = this;
        return new Promise((resolve, reject) => {
            let data = { 'id': key, data: value }
            if (_this.indexedDB) {
                let request = _this.db.transaction([_this.tableName], 'readwrite')
                    .objectStore(_this.tableName)
                    .put(data);

                request.onsuccess = function (event) {
                    resolve('数据写入成功')
                };

                request.onerror = function (event) {
                    reject(event)
                }
            } else {
                _this.db.setItem(key, JSON.stringify(data))
                resolve('数据写入成功')
            }
        });
    };
    //删除
    delete(key) {
        if (!this.db) return;
        let _this = this;
        return new Promise((resolve, reject) => {
            if (_this.indexedDB) {
                let request = _this.db.transaction([_this.tableName], 'readwrite')
                    .objectStore(_this.tableName)
                    .delete(key);
                request.onsuccess = function (event) {
                    resolve('数据删除成功')

                };
                request.onerror = function (event) {
                    reject(event)
                };
            } else {
                _this.db.removeItem(key)
                resolve('数据删除成功')
            }
        });
    };
    //获取
    get(key) {
        if (!this.db) return;
        let _this = this;
        return new Promise((resolve, reject) => {
            if (_this.indexedDB) {
                let transaction = _this.db.transaction(_this.tableName, 'readonly');
                let store = transaction.objectStore(_this.tableName);
                let result = store.get(key);
                result.onsuccess = function (e) {
                    //多嵌套了一层 所以再.data
                    let data = e.target.result;
                    if (data) data = data.data
                    resolve(data)
                };
                result.onerror = function (event) {
                    reject(event)
                };
            } else {
                let data = _this.db.getItem(key)
                if (data !== null) {
                    data = JSON.parse(data)
                    data = data.data;
                    resolve(data)
                } else {
                    reject('没有该键')
                }
            }

        });

    };
    // 清空
    clear() {
        if (!this.db) return;
        let _this = this;
        return new Promise((resolve, reject) => {
            if (_this.indexedDB) {
                var request = _this.db.transaction([_this.tableName], 'readwrite')
                    .objectStore(_this.tableName)
                    .clear();

                request.onsuccess = function (event) {
                    resolve('清空表成功')
                };

                request.onerror = function (event) {
                    reject(event)
                }
            } else {
                _this.db.clear()
                resolve('清空成功')
            }
        });
    };
    //  遍历所有数据  
    readAll() {
        if (!this.db) return;
        let _this = this;
        return new Promise((resolve, reject) => {
            if (_this.indexedDB) {
                var request = _this.db.transaction([_this.tableName], 'readonly')
                    .objectStore(_this.tableName)
                    .openCursor();
                let data = []
                request.onsuccess = function (event) {
                    var cursor = event.target.result;
                    if (cursor && cursor.value && cursor.value.data) {
                        let d = {
                            "k": cursor.value.id,
                            "v": cursor.value.data
                        }
                        data.push(d)
                        cursor.continue();
                    } else {
                        resolve(data)
                    }
                };

                request.onerror = function (event) {
                    reject(event)
                }
            } else {
                let data = [];
                //缓存 length，避免每次循环重复计算；并容错坏数据
                let len = _this.db.length;
                for (let i = 0; i < len; i++) {
                    let key = _this.db.key(i);
                    if (key === null) continue;
                    let raw = _this.db.getItem(key);
                    try {
                        let parsed = JSON.parse(raw);
                        let d = {
                            "k": key,
                            "v": parsed && parsed.data
                        }
                        data.push(d)
                    } catch (e) {
                        // 跳过无法解析的脏数据，不影响其它记录
                        console.warn("[Cache] 跳过无法解析的记录:", key);
                    }
                }
                resolve(data)
            }
        });
    };
    //sessionStorage 相关方法
    sessionAdd(key, value) {
        if (!this.sessionStorage) return;
        let _this = this;
        return new Promise((resolve, reject) => {
            let data = { 'id': key, data: value }
            _this.sessionStorage.setItem(key, JSON.stringify(data))
            resolve('数据写入成功')
        });
    };
    sessionGet(key) {
        if (!this.sessionStorage) return;
        let _this = this;
        return new Promise((resolve, reject) => {
            let data = _this.sessionStorage.getItem(key)
            if (data !== null) {
                data = JSON.parse(data)
                data = data.data;
                resolve(data)
            } else {
                reject('没有该键')
            }
        });
    };
    sessionDelete(key) {
        if (!this.sessionStorage) return;
        let _this = this;
        return new Promise((resolve, reject) => {
            _this.sessionStorage.removeItem(key)
            resolve('数据删除成功')
        });
    };
};