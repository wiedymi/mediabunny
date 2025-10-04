async function Module(moduleArg = {}) {
    var moduleRtn;
    var d = moduleArg, n = "undefined" != typeof WorkerGlobalScope, p = "./this.program", aa = import.meta.url, t = "", u, v;
    if ("object" == typeof window || n) {
        try {
            t = (new URL(".", aa)).href;
        }
        catch { }
        n && (v = a => { var b = new XMLHttpRequest; b.open("GET", a, !1); b.responseType = "arraybuffer"; b.send(null); return new Uint8Array(b.response); });
        u = async (a) => { a = await fetch(a, { credentials: "same-origin" }); if (a.ok)
            return a.arrayBuffer(); throw Error(a.status + " : " + a.url); };
    }
    var w = console.log.bind(console), x = console.error.bind(console), y, z = !1, A, B, C, D, E, F, G, H, I, J = !1;
    function K() { var a = D.buffer; E = new Int8Array(a); G = new Int16Array(a); d.HEAPU8 = F = new Uint8Array(a); new Uint16Array(a); new Int32Array(a); H = new Uint32Array(a); d.HEAPF32 = new Float32Array(a); new Float64Array(a); I = new BigInt64Array(a); new BigUint64Array(a); }
    function L(a) { d.onAbort?.(a); a = "Aborted(" + a + ")"; x(a); z = !0; a = new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info."); C?.(a); throw a; }
    var M;
    async function ba(a) { if (!y)
        try {
            var b = await u(a);
            return new Uint8Array(b);
        }
        catch { } if (a == M && y)
        a = new Uint8Array(y);
    else if (v)
        a = v(a);
    else
        throw "both async and sync fetching of the wasm failed"; return a; }
    async function ca(a, b) { try {
        var c = await ba(a);
        return await WebAssembly.instantiate(c, b);
    }
    catch (e) {
        x(`failed to asynchronously prepare wasm: ${e}`), L(e);
    } }
    async function da(a) { var b = M; if (!y)
        try {
            var c = fetch(b, { credentials: "same-origin" });
            return await WebAssembly.instantiateStreaming(c, a);
        }
        catch (e) {
            x(`wasm streaming compile failed: ${e}`), x("falling back to ArrayBuffer instantiation");
        } return ca(b, a); }
    class N {
        constructor(a) {
            this.name = "ExitStatus";
            this.message = `Program terminated with exit(${a})`;
            this.status = a;
        }
    }
    var O = a => { for (; 0 < a.length;)
        a.shift()(d); }, P = [], Q = [], ea = () => { var a = d.preRun.shift(); Q.push(a); }, R = !0, S = "undefined" != typeof TextDecoder ? new TextDecoder : void 0, T = (a, b = 0) => {
        var c = b;
        for (var e = c + void 0; a[c] && !(c >= e);)
            ++c;
        if (16 < c - b && a.buffer && S)
            return S.decode(a.subarray(b, c));
        for (e = ""; b < c;) {
            var f = a[b++];
            if (f & 128) {
                var g = a[b++] & 63;
                if (192 == (f & 224))
                    e += String.fromCharCode((f & 31) << 6 | g);
                else {
                    var h = a[b++] & 63;
                    f = 224 == (f & 240) ? (f & 15) << 12 | g << 6 | h : (f & 7) << 18 | g << 12 | h << 6 | a[b++] & 63;
                    65536 > f ? e += String.fromCharCode(f) : (f -= 65536,
                        e += String.fromCharCode(55296 | f >> 10, 56320 | f & 1023));
                }
            }
            else
                e += String.fromCharCode(f);
        }
        return e;
    }, U = 0, V = {}, fa = a => { if (!(a instanceof N || "unwind" == a))
        throw a; }, ha = a => { A = a; R || 0 < U || (d.onExit?.(a), z = !0); throw new N(a); }, ia = a => { if (!z)
        try {
            if (a(), !(R || 0 < U))
                try {
                    A = a = A, ha(a);
                }
                catch (b) {
                    fa(b);
                }
        }
        catch (b) {
            fa(b);
        } }, W = {}, ja = () => {
        if (!X) {
            var a = { USER: "web_user", LOGNAME: "web_user", PATH: "/", PWD: "/", HOME: "/home/web_user", LANG: ("object" == typeof navigator && navigator.language || "C").replace("-", "_") + ".UTF-8", _: p || "./this.program" }, b;
            for (b in W)
                void 0 === W[b] ? delete a[b] : a[b] = W[b];
            var c = [];
            for (b in a)
                c.push(`${b}=${a[b]}`);
            X = c;
        }
        return X;
    }, X, ka = (a, b, c) => {
        var e = F;
        if (!(0 < c))
            return 0;
        var f = b;
        c = b + c - 1;
        for (var g = 0; g < a.length; ++g) {
            var h = a.codePointAt(g);
            if (127 >= h) {
                if (b >= c)
                    break;
                e[b++] = h;
            }
            else if (2047 >= h) {
                if (b + 1 >= c)
                    break;
                e[b++] = 192 | h >> 6;
                e[b++] = 128 | h & 63;
            }
            else if (65535 >= h) {
                if (b + 2 >= c)
                    break;
                e[b++] = 224 | h >> 12;
                e[b++] = 128 | h >> 6 & 63;
                e[b++] = 128 | h & 63;
            }
            else {
                if (b + 3 >= c)
                    break;
                e[b++] = 240 | h >> 18;
                e[b++] = 128 | h >> 12 & 63;
                e[b++] = 128 | h >> 6 & 63;
                e[b++] = 128 | h & 63;
                g++;
            }
        }
        e[b] =
            0;
        return b - f;
    }, la = a => { for (var b = 0, c = 0; c < a.length; ++c) {
        var e = a.charCodeAt(c);
        127 >= e ? b++ : 2047 >= e ? b += 2 : 55296 <= e && 57343 >= e ? (b += 4, ++c) : b += 3;
    } return b; }, ma = [null, [], []], pa = (a, b, c, e) => {
        var f = { string: k => { var l = 0; if (null !== k && void 0 !== k && 0 !== k) {
                l = la(k) + 1;
                var q = Y(l);
                ka(k, q, l);
                l = q;
            } return l; }, array: k => { var l = Y(k.length); E.set(k, l); return l; } };
        a = d["_" + a];
        var g = [], h = 0;
        if (e)
            for (var m = 0; m < e.length; m++) {
                var r = f[c[m]];
                r ? (0 === h && (h = na()), g[m] = r(e[m])) : g[m] = e[m];
            }
        c = a(...g);
        return c = function (k) {
            0 !== h && oa(h);
            return "string" ===
                b ? k ? T(F, k) : "" : "boolean" === b ? !!k : k;
        }(c);
    };
    d.noExitRuntime && (R = d.noExitRuntime);
    d.print && (w = d.print);
    d.printErr && (x = d.printErr);
    d.wasmBinary && (y = d.wasmBinary);
    d.thisProgram && (p = d.thisProgram);
    if (d.preInit)
        for ("function" == typeof d.preInit && (d.preInit = [d.preInit]); 0 < d.preInit.length;)
            d.preInit.shift()();
    d.cwrap = (a, b, c, e) => { var f = !c || c.every(g => "number" === g || "boolean" === g); return "string" !== b && f && !e ? d["_" + a] : (...g) => pa(a, b, c, g); };
    var qa, oa, Y, na, ra = { a: function () { return 0; }, q: function () { return 0; }, n: function () { }, f: () => L(""), k: () => { R = !1; U = 0; }, l: (a, b) => { V[a] && (clearTimeout(V[a].id), delete V[a]); if (!b)
            return 0; var c = setTimeout(() => { delete V[a]; ia(() => qa(a, performance.now())); }, b); V[a] = { id: c, G: b }; return 0; }, e: function (a, b, c) { if (!(0 <= a && 3 >= a))
            return 28; I[c >> 3] = BigInt(Math.round(1E6 * (0 === a ? Date.now() : performance.now()))); return 0; }, d: () => Date.now(), m: a => {
            var b = F.length;
            a >>>= 0;
            if (2147483648 < a)
                return !1;
            for (var c = 1; 4 >= c; c *= 2) {
                var e = b * (1 + .2 /
                    c);
                e = Math.min(e, a + 100663296);
                a: {
                    e = (Math.min(2147483648, 65536 * Math.ceil(Math.max(a, e) / 65536)) - D.buffer.byteLength + 65535) / 65536 | 0;
                    try {
                        D.grow(e);
                        K();
                        var f = 1;
                        break a;
                    }
                    catch (g) { }
                    f = void 0;
                }
                if (f)
                    return !0;
            }
            return !1;
        }, b: (a, b) => { var c = 0, e = 0, f; for (f of ja()) {
            var g = b + c;
            H[a + e >> 2] = g;
            c += ka(f, g, Infinity) + 1;
            e += 4;
        } return 0; }, c: (a, b) => { var c = ja(); H[a >> 2] = c.length; a = 0; for (var e of c)
            a += la(e) + 1; H[b >> 2] = a; return 0; }, i: () => 52, p: (a, b) => {
            var c = 0;
            if (0 == a)
                c = 2;
            else if (1 == a || 2 == a)
                c = 64;
            E[b] = 2;
            G[b + 2 >> 1] = 1;
            I[b + 8 >> 3] = BigInt(c);
            I[b + 16 >>
                3] = BigInt(0);
            return 0;
        }, h: () => 52, o: function () { return 70; }, g: (a, b, c, e) => { for (var f = 0, g = 0; g < c; g++) {
            var h = H[b >> 2], m = H[b + 4 >> 2];
            b += 8;
            for (var r = 0; r < m; r++) {
                var k = a, l = F[h + r], q = ma[k];
                0 === l || 10 === l ? ((1 === k ? w : x)(T(q)), q.length = 0) : q.push(l);
            }
            f += m;
        } H[e >> 2] = f; return 0; }, j: ha }, Z;
    Z = await (async function () {
        function a(c) { Z = c.exports; D = Z.r; K(); c = Z; d._init_decoder = c.t; d._malloc = c.u; d._free = c.v; d._decode_packet = c.w; d._flush_decoder = c.x; d._close_decoder = c.y; d._init_encoder = c.z; d._encode_samples = c.A; d._close_encoder = c.B; qa = c.C; oa = c.D; Y = c.E; na = c.F; return Z; }
        var b = { a: ra };
        if (d.instantiateWasm)
            return new Promise(c => { d.instantiateWasm(b, (e, f) => { c(a(e, f)); }); });
        M ??= d.locateFile ? d.locateFile ? d.locateFile("eac3.wasm", t) : t + "eac3.wasm" : (new URL("eac3.wasm", import.meta.url)).href;
        return a((await da(b)).instance);
    }());
    (function () { function a() { d.calledRun = !0; if (!z) {
        J = !0;
        Z.s();
        B?.(d);
        d.onRuntimeInitialized?.();
        if (d.postRun)
            for ("function" == typeof d.postRun && (d.postRun = [d.postRun]); d.postRun.length;) {
                var b = d.postRun.shift();
                P.push(b);
            }
        O(P);
    } } if (d.preRun)
        for ("function" == typeof d.preRun && (d.preRun = [d.preRun]); d.preRun.length;)
            ea(); O(Q); d.setStatus ? (d.setStatus("Running..."), setTimeout(() => { setTimeout(() => d.setStatus(""), 1); a(); }, 1)) : a(); })();
    J ? moduleRtn = d : moduleRtn = new Promise((a, b) => { B = a; C = b; });
    ;
    return moduleRtn;
}
export default Module;
