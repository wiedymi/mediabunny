async function Module(moduleArg = {}) {
    var moduleRtn;
    var b = moduleArg, t = "undefined" != typeof WorkerGlobalScope, aa = import.meta.url, u = "", v, w;
    if ("object" == typeof window || t) {
        try {
            u = (new URL(".", aa)).href;
        }
        catch { }
        t && (w = a => { var d = new XMLHttpRequest; d.open("GET", a, !1); d.responseType = "arraybuffer"; d.send(null); return new Uint8Array(d.response); });
        v = async (a) => { a = await fetch(a, { credentials: "same-origin" }); if (a.ok)
            return a.arrayBuffer(); throw Error(a.status + " : " + a.url); };
    }
    var x = console.error.bind(console), y, z = !1, A, C, D, E, F, G, H = !1;
    function I() { var a = E.buffer; F = new Int8Array(a); new Int16Array(a); b.HEAPU8 = G = new Uint8Array(a); new Uint16Array(a); new Int32Array(a); new Uint32Array(a); new Float32Array(a); new Float64Array(a); new BigInt64Array(a); new BigUint64Array(a); }
    function J(a) { b.onAbort?.(a); a = "Aborted(" + a + ")"; x(a); z = !0; a = new WebAssembly.RuntimeError(a + ". Build with -sASSERTIONS for more info."); D?.(a); throw a; }
    var K;
    async function ba(a) { if (!y)
        try {
            var d = await v(a);
            return new Uint8Array(d);
        }
        catch { } if (a == K && y)
        a = new Uint8Array(y);
    else if (w)
        a = w(a);
    else
        throw "both async and sync fetching of the wasm failed"; return a; }
    async function ca(a, d) { try {
        var c = await ba(a);
        return await WebAssembly.instantiate(c, d);
    }
    catch (e) {
        x(`failed to asynchronously prepare wasm: ${e}`), J(e);
    } }
    async function da(a) { var d = K; if (!y)
        try {
            var c = fetch(d, { credentials: "same-origin" });
            return await WebAssembly.instantiateStreaming(c, a);
        }
        catch (e) {
            x(`wasm streaming compile failed: ${e}`), x("falling back to ArrayBuffer instantiation");
        } return ca(d, a); }
    class L {
        constructor(a) {
            this.name = "ExitStatus";
            this.message = `Program terminated with exit(${a})`;
            this.status = a;
        }
    }
    var M = a => { for (; 0 < a.length;)
        a.shift()(b); }, N = [], O = [], ea = () => { var a = b.preRun.shift(); O.push(a); }, P = !0, Q = 0, R = {}, S = a => { if (!(a instanceof L || "unwind" == a))
        throw a; }, T = a => { A = a; P || 0 < Q || (b.onExit?.(a), z = !0); throw new L(a); }, fa = a => { if (!z)
        try {
            if (a(), !(P || 0 < Q))
                try {
                    A = a = A, T(a);
                }
                catch (d) {
                    S(d);
                }
        }
        catch (d) {
            S(d);
        } }, U = "undefined" != typeof TextDecoder ? new TextDecoder : void 0, ha = (a = 0) => {
        var d = G;
        var c = a;
        for (var e = c + void 0; d[c] && !(c >= e);)
            ++c;
        if (16 < c - a && d.buffer && U)
            return U.decode(d.subarray(a, c));
        for (e = ""; a < c;) {
            var f = d[a++];
            if (f &
                128) {
                var l = d[a++] & 63;
                if (192 == (f & 224))
                    e += String.fromCharCode((f & 31) << 6 | l);
                else {
                    var q = d[a++] & 63;
                    f = 224 == (f & 240) ? (f & 15) << 12 | l << 6 | q : (f & 7) << 18 | l << 12 | q << 6 | d[a++] & 63;
                    65536 > f ? e += String.fromCharCode(f) : (f -= 65536, e += String.fromCharCode(55296 | f >> 10, 56320 | f & 1023));
                }
            }
            else
                e += String.fromCharCode(f);
        }
        return e;
    }, ia = (a, d, c, e) => {
        var f = { string: k => {
                var n = 0;
                if (null !== k && void 0 !== k && 0 !== k) {
                    for (var g = n = 0; g < k.length; ++g) {
                        var h = k.charCodeAt(g);
                        127 >= h ? n++ : 2047 >= h ? n += 2 : 55296 <= h && 57343 >= h ? (n += 4, ++g) : n += 3;
                    }
                    var p = n + 1;
                    g = n = V(p);
                    h = G;
                    if (0 < p) {
                        p = g + p - 1;
                        for (var B = 0; B < k.length; ++B) {
                            var m = k.codePointAt(B);
                            if (127 >= m) {
                                if (g >= p)
                                    break;
                                h[g++] = m;
                            }
                            else if (2047 >= m) {
                                if (g + 1 >= p)
                                    break;
                                h[g++] = 192 | m >> 6;
                                h[g++] = 128 | m & 63;
                            }
                            else if (65535 >= m) {
                                if (g + 2 >= p)
                                    break;
                                h[g++] = 224 | m >> 12;
                                h[g++] = 128 | m >> 6 & 63;
                                h[g++] = 128 | m & 63;
                            }
                            else {
                                if (g + 3 >= p)
                                    break;
                                h[g++] = 240 | m >> 18;
                                h[g++] = 128 | m >> 12 & 63;
                                h[g++] = 128 | m >> 6 & 63;
                                h[g++] = 128 | m & 63;
                                B++;
                            }
                        }
                        h[g] = 0;
                    }
                }
                return n;
            }, array: k => { var n = V(k.length); F.set(k, n); return n; } };
        a = b["_" + a];
        var l = [], q = 0;
        if (e)
            for (var r = 0; r < e.length; r++) {
                var X = f[c[r]];
                X ? (0 === q && (q =
                    W()), l[r] = X(e[r])) : l[r] = e[r];
            }
        c = a(...l);
        return c = function (k) { 0 !== q && Y(q); return "string" === d ? k ? ha(k) : "" : "boolean" === d ? !!k : k; }(c);
    };
    b.noExitRuntime && (P = b.noExitRuntime);
    b.printErr && (x = b.printErr);
    b.wasmBinary && (y = b.wasmBinary);
    if (b.preInit)
        for ("function" == typeof b.preInit && (b.preInit = [b.preInit]); 0 < b.preInit.length;)
            b.preInit.shift()();
    b.cwrap = (a, d, c, e) => { var f = !c || c.every(l => "number" === l || "boolean" === l); return "string" !== d && f && !e ? b["_" + a] : (...l) => ia(a, d, c, l); };
    var ja, Y, V, W, ka = { d: () => J(""), c: () => { P = !1; Q = 0; }, e: (a, d) => { R[a] && (clearTimeout(R[a].id), delete R[a]); if (!d)
            return 0; var c = setTimeout(() => { delete R[a]; fa(() => ja(a, performance.now())); }, d); R[a] = { id: c, u: d }; return 0; }, a: () => performance.now(), f: a => { var d = G.length; a >>>= 0; if (2147483648 < a)
            return !1; for (var c = 1; 4 >= c; c *= 2) {
            var e = d * (1 + .2 / c);
            e = Math.min(e, a + 100663296);
            a: {
                e = (Math.min(2147483648, 65536 * Math.ceil(Math.max(a, e) / 65536)) - E.buffer.byteLength + 65535) / 65536 | 0;
                try {
                    E.grow(e);
                    I();
                    var f = 1;
                    break a;
                }
                catch (l) { }
                f = void 0;
            }
            if (f)
                return !0;
        } return !1; },
        b: T }, Z;
    Z = await (async function () { function a(c) { Z = c.exports; E = Z.g; I(); c = Z; b._init_decoder = c.i; b._malloc = c.j; b._free = c.k; b._decode_frame = c.l; b._close_decoder = c.m; b._init_encoder = c.n; b._encode_frame = c.o; b._close_encoder = c.p; ja = c.q; Y = c.r; V = c.s; W = c.t; return Z; } var d = { a: ka }; if (b.instantiateWasm)
        return new Promise(c => { b.instantiateWasm(d, (e, f) => { c(a(e, f)); }); }); K ??= b.locateFile ? b.locateFile ? b.locateFile("xvid.wasm", u) : u + "xvid.wasm" : (new URL("xvid.wasm", import.meta.url)).href; return a((await da(d)).instance); }());
    (function () { function a() { b.calledRun = !0; if (!z) {
        H = !0;
        Z.h();
        C?.(b);
        b.onRuntimeInitialized?.();
        if (b.postRun)
            for ("function" == typeof b.postRun && (b.postRun = [b.postRun]); b.postRun.length;) {
                var d = b.postRun.shift();
                N.push(d);
            }
        M(N);
    } } if (b.preRun)
        for ("function" == typeof b.preRun && (b.preRun = [b.preRun]); b.preRun.length;)
            ea(); M(O); b.setStatus ? (b.setStatus("Running..."), setTimeout(() => { setTimeout(() => b.setStatus(""), 1); a(); }, 1)) : a(); })();
    H ? moduleRtn = b : moduleRtn = new Promise((a, d) => { C = a; D = d; });
    ;
    return moduleRtn;
}
export default Module;
