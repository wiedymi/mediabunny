/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
"use strict";
var MediabunnyMpeg4 = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // external-global-plugin:mediabunny
  var require_mediabunny = __commonJS({
    "external-global-plugin:mediabunny"(exports, module) {
      module.exports = Mediabunny;
    }
  });

  // packages/mpeg4/src/index.ts
  var index_exports = {};
  __export(index_exports, {
    Mpeg4Decoder: () => Mpeg4Decoder,
    Mpeg4Encoder: () => Mpeg4Encoder,
    registerMpeg4Decoder: () => registerMpeg4Decoder,
    registerMpeg4Encoder: () => registerMpeg4Encoder,
    setMpeg4WasmUrl: () => setMpeg4WasmUrl
  });
  var import_mediabunny = __toESM(require_mediabunny(), 1);

  // packages/mpeg4/src/xvid-loader.ts
  var customWasmUrl = null;
  function setMpeg4WasmUrl(url) {
    customWasmUrl = url;
  }
  function getCustomWasmUrl() {
    return customWasmUrl;
  }

  // inline-worker:__inline-worker
  async function inlineWorker(scriptText) {
    if (typeof Worker !== "undefined" && typeof Bun === "undefined") {
      const blob = new Blob([scriptText], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url, { type: typeof Deno !== "undefined" ? "module" : void 0 });
      URL.revokeObjectURL(url);
      return worker;
    } else {
      let Worker4;
      try {
        Worker4 = (await import("worker_threads")).Worker;
      } catch {
        const workerModule = "worker_threads";
        Worker4 = __require(workerModule).Worker;
      }
      const worker = new Worker4(scriptText, { eval: true });
      return worker;
    }
  }

  // packages/mpeg4/src/decode.worker.ts
  function Worker2() {
    return inlineWorker('var xe=Object.defineProperty;var Me=(i,o,t)=>o in i?xe(i,o,{enumerable:!0,configurable:!0,writable:!0,value:t}):i[o]=t;var _=(i=>typeof require!="undefined"?require:typeof Proxy!="undefined"?new Proxy(i,{get:(o,t)=>(typeof require!="undefined"?require:o)[t]}):i)(function(i){if(typeof require!="undefined")return require.apply(this,arguments);throw Error(\'Dynamic require of "\'+i+\'" is not supported\')});var se=(i,o,t)=>Me(i,typeof o!="symbol"?o+"":o,t);async function Ue(i={}){var o,t=i,y=typeof WorkerGlobalScope!="undefined",h="",l="",S,D;if(typeof window=="object"||y){try{l=new URL(".",h).href}catch(e){}y&&(D=e=>{var r=new XMLHttpRequest;return r.open("GET",e,!1),r.responseType="arraybuffer",r.send(null),new Uint8Array(r.response)}),S=async e=>{if(e=await fetch(e,{credentials:"same-origin"}),e.ok)return e.arrayBuffer();throw Error(e.status+" : "+e.url)}}var v=console.error.bind(console),g,E=!1,x,M,I,L,N,z,O=!1;function Y(){var e=L.buffer;N=new Int8Array(e),new Int16Array(e),t.HEAPU8=z=new Uint8Array(e),new Uint16Array(e),new Int32Array(e),new Uint32Array(e),new Float32Array(e),new Float64Array(e),new BigInt64Array(e),new BigUint64Array(e)}function J(e){var r;throw(r=t.onAbort)==null||r.call(t,e),e="Aborted("+e+")",v(e),E=!0,e=new WebAssembly.RuntimeError(e+". Build with -sASSERTIONS for more info."),I==null||I(e),e}var T;async function ve(e){if(!g)try{var r=await S(e);return new Uint8Array(r)}catch(n){}if(e==T&&g)e=new Uint8Array(g);else if(D)e=D(e);else throw"both async and sync fetching of the wasm failed";return e}async function be(e,r){try{var n=await ve(e);return await WebAssembly.instantiate(n,r)}catch(a){v(`failed to asynchronously prepare wasm: ${a}`),J(a)}}async function ge(e){var r=T;if(!g)try{var n=fetch(r,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(n,e)}catch(a){v(`wasm streaming compile failed: ${a}`),v("falling back to ArrayBuffer instantiation")}return be(r,e)}class Q{constructor(r){se(this,"name","ExitStatus");this.message=`Program terminated with exit(${r})`,this.status=r}}var Z=e=>{for(;0<e.length;)e.shift()(t)},K=[],ee=[],Ee=()=>{var e=t.preRun.shift();ee.push(e)},q=!0,V=0,k={},te=e=>{if(!(e instanceof Q||e=="unwind"))throw e},re=e=>{var r;throw x=e,q||0<V||((r=t.onExit)==null||r.call(t,e),E=!0),new Q(e)},Ae=e=>{if(!E)try{if(e(),!(q||0<V))try{x=e=x,re(e)}catch(r){te(r)}}catch(r){te(r)}},ne=typeof TextDecoder!="undefined"?new TextDecoder:void 0,Re=(e=0)=>{for(var r=z,n=e,a=n+void 0;r[n]&&!(n>=a);)++n;if(16<n-e&&r.buffer&&ne)return ne.decode(r.subarray(e,n));for(a="";e<n;){var u=r[e++];if(u&128){var m=r[e++]&63;if((u&224)==192)a+=String.fromCharCode((u&31)<<6|m);else{var A=r[e++]&63;u=(u&240)==224?(u&15)<<12|m<<6|A:(u&7)<<18|m<<12|A<<6|r[e++]&63,65536>u?a+=String.fromCharCode(u):(u-=65536,a+=String.fromCharCode(55296|u>>10,56320|u&1023))}}else a+=String.fromCharCode(u)}return a},_e=(e,r,n,a)=>{var u={string:c=>{var w=0;if(c!=null&&c!==0){for(var s=w=0;s<c.length;++s){var f=c.charCodeAt(s);127>=f?w++:2047>=f?w+=2:55296<=f&&57343>=f?(w+=4,++s):w+=3}var b=w+1;if(s=w=G(b),f=z,0<b){b=s+b-1;for(var B=0;B<c.length;++B){var p=c.codePointAt(B);if(127>=p){if(s>=b)break;f[s++]=p}else if(2047>=p){if(s+1>=b)break;f[s++]=192|p>>6,f[s++]=128|p&63}else if(65535>=p){if(s+2>=b)break;f[s++]=224|p>>12,f[s++]=128|p>>6&63,f[s++]=128|p&63}else{if(s+3>=b)break;f[s++]=240|p>>18,f[s++]=128|p>>12&63,f[s++]=128|p>>6&63,f[s++]=128|p&63,B++}}f[s]=0}}return w},array:c=>{var w=G(c.length);return N.set(c,w),w}};e=t["_"+e];var m=[],A=0;if(a)for(var R=0;R<a.length;R++){var ue=u[n[R]];ue?(A===0&&(A=ae()),m[R]=ue(a[R])):m[R]=a[R]}return n=e(...m),n=function(c){return A!==0&&oe(A),r==="string"?c?Re(c):"":r==="boolean"?!!c:c}(n)};if(t.noExitRuntime&&(q=t.noExitRuntime),t.printErr&&(v=t.printErr),t.wasmBinary&&(g=t.wasmBinary),t.preInit)for(typeof t.preInit=="function"&&(t.preInit=[t.preInit]);0<t.preInit.length;)t.preInit.shift()();t.cwrap=(e,r,n,a)=>{var u=!n||n.every(m=>m==="number"||m==="boolean");return r!=="string"&&u&&!a?t["_"+e]:(...m)=>_e(e,r,n,m)};var ie,oe,G,ae,Se={d:()=>J(""),c:()=>{q=!1,V=0},e:(e,r)=>{if(k[e]&&(clearTimeout(k[e].id),delete k[e]),!r)return 0;var n=setTimeout(()=>{delete k[e],Ae(()=>ie(e,performance.now()))},r);return k[e]={id:n,u:r},0},a:()=>performance.now(),f:e=>{var r=z.length;if(e>>>=0,2147483648<e)return!1;for(var n=1;4>=n;n*=2){var a=r*(1+.2/n);a=Math.min(a,e+100663296);e:{a=(Math.min(2147483648,65536*Math.ceil(Math.max(e,a)/65536))-L.buffer.byteLength+65535)/65536|0;try{L.grow(a),Y();var u=1;break e}catch(m){}u=void 0}if(u)return!0}return!1},b:re},U;return U=await async function(){function e(n){return U=n.exports,L=U.g,Y(),n=U,t._init_decoder=n.i,t._malloc=n.j,t._free=n.k,t._decode_frame=n.l,t._close_decoder=n.m,t._init_encoder=n.n,t._encode_frame=n.o,t._close_encoder=n.p,ie=n.q,oe=n.r,G=n.s,ae=n.t,U}var r={a:Se};return t.instantiateWasm?new Promise(n=>{t.instantiateWasm(r,(a,u)=>{n(e(a,u))})}):(T!=null||(T=t.locateFile?t.locateFile?t.locateFile("xvid.wasm",l):l+"xvid.wasm":new URL("xvid.wasm","").href),e((await ge(r)).instance))}(),function(){function e(){var n;if(t.calledRun=!0,!E){if(O=!0,U.h(),M==null||M(t),(n=t.onRuntimeInitialized)==null||n.call(t),t.postRun)for(typeof t.postRun=="function"&&(t.postRun=[t.postRun]);t.postRun.length;){var r=t.postRun.shift();K.push(r)}Z(K)}}if(t.preRun)for(typeof t.preRun=="function"&&(t.preRun=[t.preRun]);t.preRun.length;)Ee();Z(ee),t.setStatus?(t.setStatus("Running..."),setTimeout(()=>{setTimeout(()=>t.setStatus(""),1),e()},1)):e()}(),O?o=t:o=new Promise((e,r)=>{M=e,I=r}),o}var le=Ue;var de={};var X=null,$=null;function fe(i){$=i}function Pe(){var i;if($)return $;if(typeof process!="undefined"&&((i=process.versions)!=null&&i.node))try{let o=typeof _!="undefined"?_("path"):null,t=typeof _!="undefined"?_("fs"):null;if(o&&t&&typeof __dirname!="undefined"){let y=o.join(__dirname,"xvid.wasm");if(t.existsSync(y))return y}}catch(o){}return"xvid.wasm"}async function ce(){return X||(X=await le({locateFile:i=>i.endsWith(".wasm")?Pe():i})),X}var d,F,P,W,me,we,he,j=null,C=null,We=async(i,o,t)=>{if(P=i,W=o,t&&fe(t),d=await ce(),me=d.cwrap("init_decoder","number",["number","number"]),we=d.cwrap("decode_frame","number",["number","number","number","number","number","number","number"]),he=d.cwrap("close_decoder",null,["number"]),F=me(P,W),!F)throw new Error("Failed to initialize Xvid decoder")},De=i=>{let o=new Uint8Array(i);j=pe(j,o.length),d.HEAPU8.set(o,j.ptr);let t=0,y=null;for(;t<o.length;){let h=d._malloc(4),l=d._malloc(4),S=d._malloc(4),D=Math.max(P*W*3/2,1024);C=pe(C,D);let v=we(F,j.ptr+t,o.length-t,C.ptr,h,l,S),g=new DataView(d.HEAPU8.buffer,h,4).getInt32(0,!0),E=new DataView(d.HEAPU8.buffer,l,4).getInt32(0,!0),x=new DataView(d.HEAPU8.buffer,S,4).getInt32(0,!0);if(d._free(h),d._free(l),d._free(S),E>0&&x>0&&(P=E,W=x),v<=0)break;if(t+=v,g>0){let M=P*W*3/2;y={yuvData:d.HEAPU8.slice(C.ptr,C.ptr+M).buffer,width:P,height:W}}}return y},Ie=()=>({flushed:!0}),Te=()=>(F&&he(F),{closed:!0}),pe=(i,o)=>{if(!i||i.size<o){i&&d._free(i.ptr);let t=1<<Math.ceil(Math.log2(o));return{ptr:d._malloc(t),size:t}}return i},ye=async i=>{let o,t=!0,y;try{let{command:l}=i;if(l.type==="init")await We(l.data.width,l.data.height,l.data.wasmUrl),o=null;else if(l.type==="decode")o=De(l.data.frameData);else if(l.type==="flush")Ie(),o={flushed:!0};else if(l.type==="close")Te(),o={closed:!0};else throw new Error("Unknown command type.")}catch(l){t=!1,y=l,o={flushed:!0}}let h={id:i.id,success:t,data:o,error:y};H?H.postMessage(h):self.postMessage(h)},H=null;typeof self=="undefined"&&(H=_("worker_threads").parentPort);H?H.on("message",ye):self.addEventListener("message",i=>void ye(i.data));\n');
  }

  // packages/mpeg4/src/encode.worker.ts
  function Worker3() {
    return inlineWorker('var Me=Object.defineProperty;var _e=(o,i,r)=>i in o?Me(o,i,{enumerable:!0,configurable:!0,writable:!0,value:r}):o[i]=r;var g=(o=>typeof require!="undefined"?require:typeof Proxy!="undefined"?new Proxy(o,{get:(i,r)=>(typeof require!="undefined"?require:i)[r]}):o)(function(o){if(typeof require!="undefined")return require.apply(this,arguments);throw Error(\'Dynamic require of "\'+o+\'" is not supported\')});var se=(o,i,r)=>_e(o,typeof i!="symbol"?i+"":i,r);async function Ue(o={}){var i,r=o,c=typeof WorkerGlobalScope!="undefined",w="",s="",$,z;if(typeof window=="object"||c){try{s=new URL(".",w).href}catch(e){}c&&(z=e=>{var t=new XMLHttpRequest;return t.open("GET",e,!1),t.responseType="arraybuffer",t.send(null),new Uint8Array(t.response)}),$=async e=>{if(e=await fetch(e,{credentials:"same-origin"}),e.ok)return e.arrayBuffer();throw Error(e.status+" : "+e.url)}}var S=console.error.bind(console),x,P=!1,q,D,I,k,O,T,K=!1;function J(){var e=k.buffer;O=new Int8Array(e),new Int16Array(e),r.HEAPU8=T=new Uint8Array(e),new Uint16Array(e),new Int32Array(e),new Uint32Array(e),new Float32Array(e),new Float64Array(e),new BigInt64Array(e),new BigUint64Array(e)}function Q(e){var t;throw(t=r.onAbort)==null||t.call(r,e),e="Aborted("+e+")",S(e),P=!0,e=new WebAssembly.RuntimeError(e+". Build with -sASSERTIONS for more info."),I==null||I(e),e}var A;async function ve(e){if(!x)try{var t=await $(e);return new Uint8Array(t)}catch(n){}if(e==A&&x)e=new Uint8Array(x);else if(z)e=z(e);else throw"both async and sync fetching of the wasm failed";return e}async function he(e,t){try{var n=await ve(e);return await WebAssembly.instantiate(n,t)}catch(a){S(`failed to asynchronously prepare wasm: ${a}`),Q(a)}}async function Ee(e){var t=A;if(!x)try{var n=fetch(t,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(n,e)}catch(a){S(`wasm streaming compile failed: ${a}`),S("falling back to ArrayBuffer instantiation")}return he(t,e)}class V{constructor(t){se(this,"name","ExitStatus");this.message=`Program terminated with exit(${t})`,this.status=t}}var Y=e=>{for(;0<e.length;)e.shift()(r)},Z=[],ee=[],ge=()=>{var e=r.preRun.shift();ee.push(e)},C=!0,B=0,M={},re=e=>{if(!(e instanceof V||e=="unwind"))throw e},te=e=>{var t;throw q=e,C||0<B||((t=r.onExit)==null||t.call(r,e),P=!0),new V(e)},Re=e=>{if(!P)try{if(e(),!(C||0<B))try{q=e=q,te(e)}catch(t){re(t)}}catch(t){re(t)}},ne=typeof TextDecoder!="undefined"?new TextDecoder:void 0,Se=(e=0)=>{for(var t=T,n=e,a=n+void 0;t[n]&&!(n>=a);)++n;if(16<n-e&&t.buffer&&ne)return ne.decode(t.subarray(e,n));for(a="";e<n;){var u=t[e++];if(u&128){var m=t[e++]&63;if((u&224)==192)a+=String.fromCharCode((u&31)<<6|m);else{var h=t[e++]&63;u=(u&240)==224?(u&15)<<12|m<<6|h:(u&7)<<18|m<<12|h<<6|t[e++]&63,65536>u?a+=String.fromCharCode(u):(u-=65536,a+=String.fromCharCode(55296|u>>10,56320|u&1023))}}else a+=String.fromCharCode(u)}return a},xe=(e,t,n,a)=>{var u={string:f=>{var y=0;if(f!=null&&f!==0){for(var d=y=0;d<f.length;++d){var l=f.charCodeAt(d);127>=l?y++:2047>=l?y+=2:55296<=l&&57343>=l?(y+=4,++d):y+=3}var b=y+1;if(d=y=H(b),l=T,0<b){b=d+b-1;for(var F=0;F<f.length;++F){var p=f.codePointAt(F);if(127>=p){if(d>=b)break;l[d++]=p}else if(2047>=p){if(d+1>=b)break;l[d++]=192|p>>6,l[d++]=128|p&63}else if(65535>=p){if(d+2>=b)break;l[d++]=224|p>>12,l[d++]=128|p>>6&63,l[d++]=128|p&63}else{if(d+3>=b)break;l[d++]=240|p>>18,l[d++]=128|p>>12&63,l[d++]=128|p>>6&63,l[d++]=128|p&63,F++}}l[d]=0}}return y},array:f=>{var y=H(f.length);return O.set(f,y),y}};e=r["_"+e];var m=[],h=0;if(a)for(var E=0;E<a.length;E++){var ue=u[n[E]];ue?(h===0&&(h=ae()),m[E]=ue(a[E])):m[E]=a[E]}return n=e(...m),n=function(f){return h!==0&&ie(h),t==="string"?f?Se(f):"":t==="boolean"?!!f:f}(n)};if(r.noExitRuntime&&(C=r.noExitRuntime),r.printErr&&(S=r.printErr),r.wasmBinary&&(x=r.wasmBinary),r.preInit)for(typeof r.preInit=="function"&&(r.preInit=[r.preInit]);0<r.preInit.length;)r.preInit.shift()();r.cwrap=(e,t,n,a)=>{var u=!n||n.every(m=>m==="number"||m==="boolean");return t!=="string"&&u&&!a?r["_"+e]:(...m)=>xe(e,t,n,m)};var oe,ie,H,ae,Ae={d:()=>Q(""),c:()=>{C=!1,B=0},e:(e,t)=>{if(M[e]&&(clearTimeout(M[e].id),delete M[e]),!t)return 0;var n=setTimeout(()=>{delete M[e],Re(()=>oe(e,performance.now()))},t);return M[e]={id:n,u:t},0},a:()=>performance.now(),f:e=>{var t=T.length;if(e>>>=0,2147483648<e)return!1;for(var n=1;4>=n;n*=2){var a=t*(1+.2/n);a=Math.min(a,e+100663296);e:{a=(Math.min(2147483648,65536*Math.ceil(Math.max(e,a)/65536))-k.buffer.byteLength+65535)/65536|0;try{k.grow(a),J();var u=1;break e}catch(m){}u=void 0}if(u)return!0}return!1},b:te},R;return R=await async function(){function e(n){return R=n.exports,k=R.g,J(),n=R,r._init_decoder=n.i,r._malloc=n.j,r._free=n.k,r._decode_frame=n.l,r._close_decoder=n.m,r._init_encoder=n.n,r._encode_frame=n.o,r._close_encoder=n.p,oe=n.q,ie=n.r,H=n.s,ae=n.t,R}var t={a:Ae};return r.instantiateWasm?new Promise(n=>{r.instantiateWasm(t,(a,u)=>{n(e(a,u))})}):(A!=null||(A=r.locateFile?r.locateFile?r.locateFile("xvid.wasm",s):s+"xvid.wasm":new URL("xvid.wasm","").href),e((await Ee(t)).instance))}(),function(){function e(){var n;if(r.calledRun=!0,!P){if(K=!0,R.h(),D==null||D(r),(n=r.onRuntimeInitialized)==null||n.call(r),r.postRun)for(typeof r.postRun=="function"&&(r.postRun=[r.postRun]);r.postRun.length;){var t=r.postRun.shift();Z.push(t)}Y(Z)}}if(r.preRun)for(typeof r.preRun=="function"&&(r.preRun=[r.preRun]);r.preRun.length;)ge();Y(ee),r.setStatus?(r.setStatus("Running..."),setTimeout(()=>{setTimeout(()=>r.setStatus(""),1),e()},1)):e()}(),K?i=r:i=new Promise((e,t)=>{D=e,I=t}),i}var de=Ue;var le={};var N=null,j=null;function fe(o){j=o}function We(){var o;if(j)return j;if(typeof process!="undefined"&&((o=process.versions)!=null&&o.node))try{let i=typeof g!="undefined"?g("path"):null,r=typeof g!="undefined"?g("fs"):null;if(i&&r&&typeof __dirname!="undefined"){let c=i.join(__dirname,"xvid.wasm");if(r.existsSync(c))return c}}catch(i){}return"xvid.wasm"}async function ce(){return N||(N=await de({locateFile:o=>o.endsWith(".wasm")?We():o})),N}var v,U,G,X,me,we,be,L=null,_=null,Pe=async(o,i,r,c,w,s)=>{if(G=o,X=i,s&&fe(s),v=await ce(),me=v.cwrap("init_encoder","number",["number","number","number","number","number"]),we=v.cwrap("encode_frame","number",["number","number","number","number","number"]),be=v.cwrap("close_encoder",null,["number"]),U=me(G,X,r,c,w),!U)throw new Error("Failed to initialize Xvid encoder")},De=(o,i)=>{let r=new Uint8Array(o);L=pe(L,r.length),v.HEAPU8.set(r,L.ptr);let c=G*X*2;_=pe(_,c);let w=we(U,L.ptr,_.ptr,c,i?1:0);if(w<0)throw new Error(`Xvid encode error: ${w}`);return{encodedData:v.HEAPU8.slice(_.ptr,_.ptr+w).buffer}},Ie=()=>(U&&be(U),{closed:!0}),pe=(o,i)=>{if(!o||o.size<i){o&&v._free(o.ptr);let r=1<<Math.ceil(Math.log2(i));return{ptr:v._malloc(r),size:r}}return o},ye=async o=>{let i,r=!0,c;try{let{command:s}=o;if(s.type==="init")await Pe(s.data.width,s.data.height,s.data.bitrate,s.data.fpsNum,s.data.fpsDen,s.data.wasmUrl),i=null;else if(s.type==="encode")i=De(s.data.yuvData,s.data.forceKeyframe);else if(s.type==="close")Ie(),i={closed:!0};else throw new Error("Unknown command type.")}catch(s){r=!1,c=s,i={closed:!0}}let w={id:o.id,success:r,data:i,error:c};W?W.postMessage(w):self.postMessage(w)},W=null;typeof self=="undefined"&&(W=g("worker_threads").parentPort);W?W.on("message",ye):self.addEventListener("message",o=>void ye(o.data));\n');
  }

  // packages/mpeg4/src/index.ts
  var Mpeg4Decoder = class extends import_mediabunny.CustomVideoDecoder {
    constructor() {
      super(...arguments);
      this.worker = null;
      this.nextMessageId = 0;
      this.pendingMessages = /* @__PURE__ */ new Map();
    }
    static supports(codec, config) {
      return codec === "mpeg4";
    }
    async init() {
      this.worker = await Worker2();
      const onMessage = (event) => {
        const data = event.data;
        const pending = this.pendingMessages.get(data.id);
        assert(pending !== void 0);
        this.pendingMessages.delete(data.id);
        if (data.success) {
          pending.resolve(data.data);
        } else {
          pending.reject(data.error);
        }
      };
      this.worker.addEventListener("message", onMessage);
      await this.sendCommand({
        type: "init",
        data: {
          width: this.config.codedWidth,
          height: this.config.codedHeight,
          wasmUrl: getCustomWasmUrl() ?? void 0
        }
      });
    }
    async decode(packet, meta) {
      const frameData = packet.data.slice().buffer;
      const result = await this.sendCommand({
        type: "decode",
        data: {
          frameData
        }
      }, [frameData]);
      if (!result || !("yuvData" in result)) {
        return;
      }
      const videoFrame = new VideoFrame(new Uint8Array(result.yuvData), {
        format: "I420",
        codedWidth: result.width,
        codedHeight: result.height,
        timestamp: packet.timestamp * 1e6
      });
      const videoSample = new import_mediabunny.VideoSample(videoFrame);
      this.onSample(videoSample);
    }
    async flush() {
      await this.sendCommand({ type: "flush" });
    }
    close() {
      if (this.worker) {
        void this.sendCommand({ type: "close" });
        this.worker.terminate();
      }
    }
    sendCommand(command, transferables) {
      return new Promise((resolve, reject) => {
        const id = this.nextMessageId++;
        this.pendingMessages.set(id, { resolve, reject });
        assert(this.worker !== null);
        if (transferables) {
          this.worker.postMessage({ id, command }, transferables);
        } else {
          this.worker.postMessage({ id, command });
        }
      });
    }
  };
  var Mpeg4Encoder = class extends import_mediabunny.CustomVideoEncoder {
    constructor() {
      super(...arguments);
      this.worker = null;
      this.nextMessageId = 0;
      this.pendingMessages = /* @__PURE__ */ new Map();
      this.frameCount = 0;
    }
    static supports(codec, config) {
      return codec === "mpeg4";
    }
    async init() {
      this.worker = await Worker3();
      const onMessage = (event) => {
        const data = event.data;
        const pending = this.pendingMessages.get(data.id);
        assert(pending !== void 0);
        this.pendingMessages.delete(data.id);
        if (data.success) {
          pending.resolve(data.data);
        } else {
          pending.reject(data.error);
        }
      };
      this.worker.addEventListener("message", onMessage);
      const fpsNum = Math.round((this.config.framerate ?? 30) * 1e3);
      const fpsDen = 1e3;
      await this.sendCommand({
        type: "init",
        data: {
          width: this.config.width,
          height: this.config.height,
          bitrate: this.config.bitrate ?? 2e6,
          fpsNum,
          fpsDen,
          wasmUrl: getCustomWasmUrl() ?? void 0
        }
      });
    }
    async encode(videoSample, options) {
      const yuvSize = videoSample.codedWidth * videoSample.codedHeight * 3 / 2;
      const yuvData = new ArrayBuffer(yuvSize);
      const yuvBytes = new Uint8Array(yuvData);
      await videoSample.copyTo(yuvBytes);
      const result = await this.sendCommand({
        type: "encode",
        data: {
          yuvData,
          forceKeyframe: options.keyFrame ?? false
        }
      }, [yuvData]);
      assert(result && "encodedData" in result);
      const encodedPacket = new import_mediabunny.EncodedPacket(
        new Uint8Array(result.encodedData),
        options.keyFrame ? "key" : "delta",
        videoSample.timestamp,
        videoSample.duration,
        this.frameCount++
      );
      this.onPacket(encodedPacket, this.frameCount === 1 ? {
        decoderConfig: {
          codec: "mpeg4",
          codedWidth: this.config.width,
          codedHeight: this.config.height
        }
      } : void 0);
    }
    async flush() {
    }
    close() {
      if (this.worker) {
        void this.sendCommand({ type: "close" });
        this.worker.terminate();
      }
    }
    sendCommand(command, transferables) {
      return new Promise((resolve, reject) => {
        const id = this.nextMessageId++;
        this.pendingMessages.set(id, { resolve, reject });
        assert(this.worker !== null);
        if (transferables) {
          this.worker.postMessage({ id, command }, transferables);
        } else {
          this.worker.postMessage({ id, command });
        }
      });
    }
  };
  var registerMpeg4Decoder = (wasmUrl) => {
    if (wasmUrl) setMpeg4WasmUrl(wasmUrl);
    (0, import_mediabunny.registerDecoder)(Mpeg4Decoder);
  };
  var registerMpeg4Encoder = (wasmUrl) => {
    if (wasmUrl) setMpeg4WasmUrl(wasmUrl);
    (0, import_mediabunny.registerEncoder)(Mpeg4Encoder);
  };
  function assert(x) {
    if (!x) {
      throw new Error("Assertion failed.");
    }
  }
  return __toCommonJS(index_exports);
})();
if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, MediabunnyMpeg4)
