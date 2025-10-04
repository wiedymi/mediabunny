/*!
 * Copyright (c) 2025-present, Vanilagy and contributors
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */
"use strict";
var MediabunnyEac3 = (() => {
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

  // packages/eac3/src/index.ts
  var index_exports = {};
  __export(index_exports, {
    registerEac3Decoder: () => registerEac3Decoder,
    registerEac3Encoder: () => registerEac3Encoder,
    setEac3WasmUrl: () => setEac3WasmUrl
  });
  var import_mediabunny = __toESM(require_mediabunny(), 1);

  // packages/eac3/src/eac3-loader.ts
  var customWasmUrl = null;
  function setEac3WasmUrl(url) {
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

  // packages/eac3/src/decode.worker.ts
  function Worker2() {
    return inlineWorker('var Fe=Object.defineProperty;var Te=(a,i,t)=>i in a?Fe(a,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):a[i]=t;var _=(a=>typeof require!="undefined"?require:typeof Proxy!="undefined"?new Proxy(a,{get:(i,t)=>(typeof require!="undefined"?require:i)[t]}):a)(function(a){if(typeof require!="undefined")return require.apply(this,arguments);throw Error(\'Dynamic require of "\'+a+\'" is not supported\')});var pe=(a,i,t)=>Te(a,typeof i!="symbol"?i+"":i,t);async function ke(a={}){var i,t=a,d=typeof WorkerGlobalScope!="undefined",w="./this.program",f="",M="",h,b;if(typeof window=="object"||d){try{M=new URL(".",f).href}catch(e){}d&&(b=e=>{var r=new XMLHttpRequest;return r.open("GET",e,!1),r.responseType="arraybuffer",r.send(null),new Uint8Array(r.response)}),h=async e=>{if(e=await fetch(e,{credentials:"same-origin"}),e.ok)return e.arrayBuffer();throw Error(e.status+" : "+e.url)}}var v=console.log.bind(console),g=console.error.bind(console),R,F=!1,G,T,k,B,O,U,K,E,L,Q=!1;function Y(){var e=B.buffer;O=new Int8Array(e),K=new Int16Array(e),t.HEAPU8=U=new Uint8Array(e),new Uint16Array(e),new Int32Array(e),E=new Uint32Array(e),t.HEAPF32=new Float32Array(e),new Float64Array(e),L=new BigInt64Array(e),new BigUint64Array(e)}function Z(e){var r;throw(r=t.onAbort)==null||r.call(t,e),e="Aborted("+e+")",g(e),F=!0,e=new WebAssembly.RuntimeError(e+". Build with -sASSERTIONS for more info."),k==null||k(e),e}var x;async function De(e){if(!R)try{var r=await h(e);return new Uint8Array(r)}catch(n){}if(e==x&&R)e=new Uint8Array(R);else if(b)e=b(e);else throw"both async and sync fetching of the wasm failed";return e}async function Pe(e,r){try{var n=await De(e);return await WebAssembly.instantiate(n,r)}catch(o){g(`failed to asynchronously prepare wasm: ${o}`),Z(o)}}async function Me(e){var r=x;if(!R)try{var n=fetch(r,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(n,e)}catch(o){g(`wasm streaming compile failed: ${o}`),g("falling back to ArrayBuffer instantiation")}return Pe(r,e)}class ee{constructor(r){pe(this,"name","ExitStatus");this.message=`Program terminated with exit(${r})`,this.status=r}}var re=e=>{for(;0<e.length;)e.shift()(t)},te=[],ne=[],Ue=()=>{var e=t.preRun.shift();ne.push(e)},H=!0,oe=typeof TextDecoder!="undefined"?new TextDecoder:void 0,ae=(e,r=0)=>{for(var n=r,o=n+void 0;e[n]&&!(n>=o);)++n;if(16<n-r&&e.buffer&&oe)return oe.decode(e.subarray(r,n));for(o="";r<n;){var u=e[r++];if(u&128){var s=e[r++]&63;if((u&224)==192)o+=String.fromCharCode((u&31)<<6|s);else{var l=e[r++]&63;u=(u&240)==224?(u&15)<<12|s<<6|l:(u&7)<<18|s<<12|l<<6|e[r++]&63,65536>u?o+=String.fromCharCode(u):(u-=65536,o+=String.fromCharCode(55296|u>>10,56320|u&1023))}}else o+=String.fromCharCode(u)}return o},j=0,I={},ie=e=>{if(!(e instanceof ee||e=="unwind"))throw e},ue=e=>{var r;throw G=e,H||0<j||((r=t.onExit)==null||r.call(t,e),F=!0),new ee(e)},xe=e=>{if(!F)try{if(e(),!(H||0<j))try{G=e=G,ue(e)}catch(r){ie(r)}}catch(r){ie(r)}},q={},se=()=>{if(!V){var e={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:(typeof navigator=="object"&&navigator.language||"C").replace("-","_")+".UTF-8",_:w||"./this.program"},r;for(r in q)q[r]===void 0?delete e[r]:e[r]=q[r];var n=[];for(r in e)n.push(`${r}=${e[r]}`);V=n}return V},V,le=(e,r,n)=>{var o=U;if(!(0<n))return 0;var u=r;n=r+n-1;for(var s=0;s<e.length;++s){var l=e.codePointAt(s);if(127>=l){if(r>=n)break;o[r++]=l}else if(2047>=l){if(r+1>=n)break;o[r++]=192|l>>6,o[r++]=128|l&63}else if(65535>=l){if(r+2>=n)break;o[r++]=224|l>>12,o[r++]=128|l>>6&63,o[r++]=128|l&63}else{if(r+3>=n)break;o[r++]=240|l>>18,o[r++]=128|l>>12&63,o[r++]=128|l>>6&63,o[r++]=128|l&63,s++}}return o[r]=0,r-u},ce=e=>{for(var r=0,n=0;n<e.length;++n){var o=e.charCodeAt(n);127>=o?r++:2047>=o?r+=2:55296<=o&&57343>=o?(r+=4,++n):r+=3}return r},Ie=[null,[],[]],Ce=(e,r,n,o)=>{var u={string:m=>{var p=0;if(m!=null&&m!==0){p=ce(m)+1;var P=$(p);le(m,P,p),p=P}return p},array:m=>{var p=$(m.length);return O.set(m,p),p}};e=t["_"+e];var s=[],l=0;if(o)for(var y=0;y<o.length;y++){var D=u[n[y]];D?(l===0&&(l=me()),s[y]=D(o[y])):s[y]=o[y]}return n=e(...s),n=function(m){return l!==0&&de(l),r==="string"?m?ae(U,m):"":r==="boolean"?!!m:m}(n)};if(t.noExitRuntime&&(H=t.noExitRuntime),t.print&&(v=t.print),t.printErr&&(g=t.printErr),t.wasmBinary&&(R=t.wasmBinary),t.thisProgram&&(w=t.thisProgram),t.preInit)for(typeof t.preInit=="function"&&(t.preInit=[t.preInit]);0<t.preInit.length;)t.preInit.shift()();t.cwrap=(e,r,n,o)=>{var u=!n||n.every(s=>s==="number"||s==="boolean");return r!=="string"&&u&&!o?t["_"+e]:(...s)=>Ce(e,r,n,s)};var fe,de,$,me,We={a:function(){return 0},q:function(){return 0},n:function(){},f:()=>Z(""),k:()=>{H=!1,j=0},l:(e,r)=>{if(I[e]&&(clearTimeout(I[e].id),delete I[e]),!r)return 0;var n=setTimeout(()=>{delete I[e],xe(()=>fe(e,performance.now()))},r);return I[e]={id:n,G:r},0},e:function(e,r,n){return 0<=e&&3>=e?(L[n>>3]=BigInt(Math.round(1e6*(e===0?Date.now():performance.now()))),0):28},d:()=>Date.now(),m:e=>{var r=U.length;if(e>>>=0,2147483648<e)return!1;for(var n=1;4>=n;n*=2){var o=r*(1+.2/n);o=Math.min(o,e+100663296);e:{o=(Math.min(2147483648,65536*Math.ceil(Math.max(e,o)/65536))-B.buffer.byteLength+65535)/65536|0;try{B.grow(o),Y();var u=1;break e}catch(s){}u=void 0}if(u)return!0}return!1},b:(e,r)=>{var n=0,o=0,u;for(u of se()){var s=r+n;E[e+o>>2]=s,n+=le(u,s,1/0)+1,o+=4}return 0},c:(e,r)=>{var n=se();E[e>>2]=n.length,e=0;for(var o of n)e+=ce(o)+1;return E[r>>2]=e,0},i:()=>52,p:(e,r)=>{var n=0;return e==0?n=2:(e==1||e==2)&&(n=64),O[r]=2,K[r+2>>1]=1,L[r+8>>3]=BigInt(n),L[r+16>>3]=BigInt(0),0},h:()=>52,o:function(){return 70},g:(e,r,n,o)=>{for(var u=0,s=0;s<n;s++){var l=E[r>>2],y=E[r+4>>2];r+=8;for(var D=0;D<y;D++){var m=e,p=U[l+D],P=Ie[m];p===0||p===10?((m===1?v:g)(ae(P)),P.length=0):P.push(p)}u+=y}return E[o>>2]=u,0},j:ue},S;return S=await async function(){function e(n){return S=n.exports,B=S.r,Y(),n=S,t._init_decoder=n.t,t._malloc=n.u,t._free=n.v,t._decode_packet=n.w,t._flush_decoder=n.x,t._close_decoder=n.y,t._init_encoder=n.z,t._encode_samples=n.A,t._close_encoder=n.B,fe=n.C,de=n.D,$=n.E,me=n.F,S}var r={a:We};return t.instantiateWasm?new Promise(n=>{t.instantiateWasm(r,(o,u)=>{n(e(o,u))})}):(x!=null||(x=t.locateFile?t.locateFile?t.locateFile("eac3.wasm",M):M+"eac3.wasm":new URL("eac3.wasm","").href),e((await Me(r)).instance))}(),function(){function e(){var n;if(t.calledRun=!0,!F){if(Q=!0,S.s(),T==null||T(t),(n=t.onRuntimeInitialized)==null||n.call(t),t.postRun)for(typeof t.postRun=="function"&&(t.postRun=[t.postRun]);t.postRun.length;){var r=t.postRun.shift();te.push(r)}re(te)}}if(t.preRun)for(typeof t.preRun=="function"&&(t.preRun=[t.preRun]);t.preRun.length;)Ue();re(ne),t.setStatus?(t.setStatus("Running..."),setTimeout(()=>{setTimeout(()=>t.setStatus(""),1),e()},1)):e()}(),Q?i=t:i=new Promise((e,r)=>{T=e,k=r}),i}var we=ke;var ye={};var N=null,X=null;function he(a){X=a}function Be(){var a;if(X)return X;if(typeof process!="undefined"&&((a=process.versions)!=null&&a.node))try{let i=typeof _!="undefined"?_("path"):null,t=typeof _!="undefined"?_("fs"):null;if(i&&t&&typeof __dirname!="undefined"){let d=i.join(__dirname,"eac3.wasm");if(t.existsSync(d))return d}}catch(i){}return"eac3.wasm"}async function ve(){return N||(N=await we({locateFile:a=>a.endsWith(".wasm")?Be():a})),N}var Le=86019,He=86056,c,A,ge,J,Ee,be,Re,Se,z=null,C=null,ze=async(a,i,t,d)=>{if(ge=a,J=i,d&&he(d),c=await ve(),Ee=c.cwrap("init_decoder","number",["number","number","number"]),be=c.cwrap("decode_packet","number",["number","number","number","number","number","number","number"]),Re=c.cwrap("flush_decoder",null,["number"]),Se=c.cwrap("close_decoder",null,["number"]),A=Ee(t==="eac3"?He:Le,ge,J),!A)throw new Error("Failed to initialize E-AC-3/AC-3 decoder")},Ge=a=>{let i=new Uint8Array(a);z=_e(z,i.length),c.HEAPU8.set(i,z.ptr);let t=6144*J;C=_e(C,t*4);let d=c._malloc(4),w=c._malloc(4),f=c._malloc(4),M=be(A,z.ptr,i.length,C.ptr,d,w,f),h=new DataView(c.HEAPU8.buffer,d,4).getInt32(0,!0),b=new DataView(c.HEAPU8.buffer,w,4).getInt32(0,!0),v=new DataView(c.HEAPU8.buffer,f,4).getInt32(0,!0);if(c._free(d),c._free(w),c._free(f),M<0||h<=0||b<=0||v<=0)return null;let g=h*v*4;return{pcmData:c.HEAPF32.slice(C.ptr/4,C.ptr/4+h*v).buffer,numberOfFrames:h,sampleRate:b,channels:v}},Oe=()=>(A&&Re(A),{flushed:!0}),je=()=>(A&&Se(A),{closed:!0}),_e=(a,i)=>{if(!a||a.size<i){a&&c._free(a.ptr);let t=1<<Math.ceil(Math.log2(i));return{ptr:c._malloc(t),size:t}}return a},Ae=async a=>{let i,t=!0,d;try{let{command:f}=a;if(f.type==="init")await ze(f.data.sampleRate,f.data.channels,f.data.codec,f.data.wasmUrl),i=null;else if(f.type==="decode")i=Ge(f.data.packetData);else if(f.type==="flush")Oe(),i={flushed:!0};else if(f.type==="close")je(),i={closed:!0};else throw new Error("Unknown command type.")}catch(f){t=!1,d=f,i={flushed:!0}}let w={id:a.id,success:t,data:i,error:d};W?W.postMessage(w):self.postMessage(w)},W=null;typeof self=="undefined"&&(W=_("worker_threads").parentPort);W?W.on("message",Ae):self.addEventListener("message",a=>void Ae(a.data));\n');
  }

  // packages/eac3/src/encode.worker.ts
  function Worker3() {
    return inlineWorker('var Pe=Object.defineProperty;var De=(a,i,t)=>i in a?Pe(a,i,{enumerable:!0,configurable:!0,writable:!0,value:t}):a[i]=t;var v=(a=>typeof require!="undefined"?require:typeof Proxy!="undefined"?new Proxy(a,{get:(i,t)=>(typeof require!="undefined"?require:i)[t]}):a)(function(a){if(typeof require!="undefined")return require.apply(this,arguments);throw Error(\'Dynamic require of "\'+a+\'" is not supported\')});var me=(a,i,t)=>De(a,typeof i!="symbol"?i+"":i,t);async function We(a={}){var i,t=a,d=typeof WorkerGlobalScope!="undefined",m="./this.program",c="",B="",V,z;if(typeof window=="object"||d){try{B=new URL(".",c).href}catch(e){}d&&(z=e=>{var r=new XMLHttpRequest;return r.open("GET",e,!1),r.responseType="arraybuffer",r.send(null),new Uint8Array(r.response)}),V=async e=>{if(e=await fetch(e,{credentials:"same-origin"}),e.ok)return e.arrayBuffer();throw Error(e.status+" : "+e.url)}}var X=console.log.bind(console),E=console.error.bind(console),b,I=!1,k,P,D,W,H,R,J,h,F,K=!1;function Q(){var e=W.buffer;H=new Int8Array(e),J=new Int16Array(e),t.HEAPU8=R=new Uint8Array(e),new Uint16Array(e),new Int32Array(e),h=new Uint32Array(e),t.HEAPF32=new Float32Array(e),new Float64Array(e),F=new BigInt64Array(e),new BigUint64Array(e)}function Y(e){var r;throw(r=t.onAbort)==null||r.call(t,e),e="Aborted("+e+")",E(e),I=!0,e=new WebAssembly.RuntimeError(e+". Build with -sASSERTIONS for more info."),D==null||D(e),e}var S;async function be(e){if(!b)try{var r=await V(e);return new Uint8Array(r)}catch(n){}if(e==S&&b)e=new Uint8Array(b);else if(z)e=z(e);else throw"both async and sync fetching of the wasm failed";return e}async function Re(e,r){try{var n=await be(e);return await WebAssembly.instantiate(n,r)}catch(o){E(`failed to asynchronously prepare wasm: ${o}`),Y(o)}}async function Se(e){var r=S;if(!b)try{var n=fetch(r,{credentials:"same-origin"});return await WebAssembly.instantiateStreaming(n,e)}catch(o){E(`wasm streaming compile failed: ${o}`),E("falling back to ArrayBuffer instantiation")}return Re(r,e)}class Z{constructor(r){me(this,"name","ExitStatus");this.message=`Program terminated with exit(${r})`,this.status=r}}var ee=e=>{for(;0<e.length;)e.shift()(t)},re=[],te=[],Me=()=>{var e=t.preRun.shift();te.push(e)},T=!0,ne=typeof TextDecoder!="undefined"?new TextDecoder:void 0,oe=(e,r=0)=>{for(var n=r,o=n+void 0;e[n]&&!(n>=o);)++n;if(16<n-r&&e.buffer&&ne)return ne.decode(e.subarray(r,n));for(o="";r<n;){var u=e[r++];if(u&128){var s=e[r++]&63;if((u&224)==192)o+=String.fromCharCode((u&31)<<6|s);else{var l=e[r++]&63;u=(u&240)==224?(u&15)<<12|s<<6|l:(u&7)<<18|s<<12|l<<6|e[r++]&63,65536>u?o+=String.fromCharCode(u):(u-=65536,o+=String.fromCharCode(55296|u>>10,56320|u&1023))}}else o+=String.fromCharCode(u)}return o},G=0,M={},ae=e=>{if(!(e instanceof Z||e=="unwind"))throw e},ie=e=>{var r;throw k=e,T||0<G||((r=t.onExit)==null||r.call(t,e),I=!0),new Z(e)},xe=e=>{if(!I)try{if(e(),!(T||0<G))try{k=e=k,ie(e)}catch(r){ae(r)}}catch(r){ae(r)}},O={},ue=()=>{if(!j){var e={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:(typeof navigator=="object"&&navigator.language||"C").replace("-","_")+".UTF-8",_:m||"./this.program"},r;for(r in O)O[r]===void 0?delete e[r]:e[r]=O[r];var n=[];for(r in e)n.push(`${r}=${e[r]}`);j=n}return j},j,se=(e,r,n)=>{var o=R;if(!(0<n))return 0;var u=r;n=r+n-1;for(var s=0;s<e.length;++s){var l=e.codePointAt(s);if(127>=l){if(r>=n)break;o[r++]=l}else if(2047>=l){if(r+1>=n)break;o[r++]=192|l>>6,o[r++]=128|l&63}else if(65535>=l){if(r+2>=n)break;o[r++]=224|l>>12,o[r++]=128|l>>6&63,o[r++]=128|l&63}else{if(r+3>=n)break;o[r++]=240|l>>18,o[r++]=128|l>>12&63,o[r++]=128|l>>6&63,o[r++]=128|l&63,s++}}return o[r]=0,r-u},le=e=>{for(var r=0,n=0;n<e.length;++n){var o=e.charCodeAt(n);127>=o?r++:2047>=o?r+=2:55296<=o&&57343>=o?(r+=4,++n):r+=3}return r},Ue=[null,[],[]],Ce=(e,r,n,o)=>{var u={string:f=>{var p=0;if(f!=null&&f!==0){p=le(f)+1;var _=q(p);se(f,_,p),p=_}return p},array:f=>{var p=q(f.length);return H.set(f,p),p}};e=t["_"+e];var s=[],l=0;if(o)for(var w=0;w<o.length;w++){var A=u[n[w]];A?(l===0&&(l=de()),s[w]=A(o[w])):s[w]=o[w]}return n=e(...s),n=function(f){return l!==0&&fe(l),r==="string"?f?oe(R,f):"":r==="boolean"?!!f:f}(n)};if(t.noExitRuntime&&(T=t.noExitRuntime),t.print&&(X=t.print),t.printErr&&(E=t.printErr),t.wasmBinary&&(b=t.wasmBinary),t.thisProgram&&(m=t.thisProgram),t.preInit)for(typeof t.preInit=="function"&&(t.preInit=[t.preInit]);0<t.preInit.length;)t.preInit.shift()();t.cwrap=(e,r,n,o)=>{var u=!n||n.every(s=>s==="number"||s==="boolean");return r!=="string"&&u&&!o?t["_"+e]:(...s)=>Ce(e,r,n,s)};var ce,fe,q,de,Ie={a:function(){return 0},q:function(){return 0},n:function(){},f:()=>Y(""),k:()=>{T=!1,G=0},l:(e,r)=>{if(M[e]&&(clearTimeout(M[e].id),delete M[e]),!r)return 0;var n=setTimeout(()=>{delete M[e],xe(()=>ce(e,performance.now()))},r);return M[e]={id:n,G:r},0},e:function(e,r,n){return 0<=e&&3>=e?(F[n>>3]=BigInt(Math.round(1e6*(e===0?Date.now():performance.now()))),0):28},d:()=>Date.now(),m:e=>{var r=R.length;if(e>>>=0,2147483648<e)return!1;for(var n=1;4>=n;n*=2){var o=r*(1+.2/n);o=Math.min(o,e+100663296);e:{o=(Math.min(2147483648,65536*Math.ceil(Math.max(e,o)/65536))-W.buffer.byteLength+65535)/65536|0;try{W.grow(o),Q();var u=1;break e}catch(s){}u=void 0}if(u)return!0}return!1},b:(e,r)=>{var n=0,o=0,u;for(u of ue()){var s=r+n;h[e+o>>2]=s,n+=se(u,s,1/0)+1,o+=4}return 0},c:(e,r)=>{var n=ue();h[e>>2]=n.length,e=0;for(var o of n)e+=le(o)+1;return h[r>>2]=e,0},i:()=>52,p:(e,r)=>{var n=0;return e==0?n=2:(e==1||e==2)&&(n=64),H[r]=2,J[r+2>>1]=1,F[r+8>>3]=BigInt(n),F[r+16>>3]=BigInt(0),0},h:()=>52,o:function(){return 70},g:(e,r,n,o)=>{for(var u=0,s=0;s<n;s++){var l=h[r>>2],w=h[r+4>>2];r+=8;for(var A=0;A<w;A++){var f=e,p=R[l+A],_=Ue[f];p===0||p===10?((f===1?X:E)(oe(_)),_.length=0):_.push(p)}u+=w}return h[o>>2]=u,0},j:ie},g;return g=await async function(){function e(n){return g=n.exports,W=g.r,Q(),n=g,t._init_decoder=n.t,t._malloc=n.u,t._free=n.v,t._decode_packet=n.w,t._flush_decoder=n.x,t._close_decoder=n.y,t._init_encoder=n.z,t._encode_samples=n.A,t._close_encoder=n.B,ce=n.C,fe=n.D,q=n.E,de=n.F,g}var r={a:Ie};return t.instantiateWasm?new Promise(n=>{t.instantiateWasm(r,(o,u)=>{n(e(o,u))})}):(S!=null||(S=t.locateFile?t.locateFile?t.locateFile("eac3.wasm",B):B+"eac3.wasm":new URL("eac3.wasm","").href),e((await Se(r)).instance))}(),function(){function e(){var n;if(t.calledRun=!0,!I){if(K=!0,g.s(),P==null||P(t),(n=t.onRuntimeInitialized)==null||n.call(t),t.postRun)for(typeof t.postRun=="function"&&(t.postRun=[t.postRun]);t.postRun.length;){var r=t.postRun.shift();re.push(r)}ee(re)}}if(t.preRun)for(typeof t.preRun=="function"&&(t.preRun=[t.preRun]);t.preRun.length;)Me();ee(te),t.setStatus?(t.setStatus("Running..."),setTimeout(()=>{setTimeout(()=>t.setStatus(""),1),e()},1)):e()}(),K?i=t:i=new Promise((e,r)=>{P=e,D=r}),i}var pe=We;var we={};var $=null,N=null;function ye(a){N=a}function Fe(){var a;if(N)return N;if(typeof process!="undefined"&&((a=process.versions)!=null&&a.node))try{let i=typeof v!="undefined"?v("path"):null,t=typeof v!="undefined"?v("fs"):null;if(i&&t&&typeof __dirname!="undefined"){let d=i.join(__dirname,"eac3.wasm");if(t.existsSync(d))return d}}catch(i){}return"eac3.wasm"}async function he(){return $||($=await pe({locateFile:a=>a.endsWith(".wasm")?Fe():a})),$}var Te=86019,Le=86056,y,U;var ve,Ae,_e,L=null,x=null,Be=async(a,i,t,d,m)=>{if(m&&ye(m),y=await he(),ve=y.cwrap("init_encoder","number",["number","number","number","number"]),Ae=y.cwrap("encode_samples","number",["number","number","number","number","number"]),_e=y.cwrap("close_encoder",null,["number"]),U=ve(d==="eac3"?Le:Te,a,i,t),!U)throw new Error("Failed to initialize E-AC-3/AC-3 encoder")},ze=(a,i)=>{let t=new Float32Array(a);L=Ee(L,t.byteLength),y.HEAPF32.set(t,L.ptr/4);let d=i*10;x=Ee(x,d);let m=Ae(U,L.ptr,i,x.ptr,d);if(m<0)throw new Error(`E-AC-3 encode error: ${m}`);return{encodedData:y.HEAPU8.slice(x.ptr,x.ptr+m).buffer}},ke=()=>(U&&_e(U),{closed:!0}),Ee=(a,i)=>{if(!a||a.size<i){a&&y._free(a.ptr);let t=1<<Math.ceil(Math.log2(i));return{ptr:y._malloc(t),size:t}}return a},ge=async a=>{let i,t=!0,d;try{let{command:c}=a;if(c.type==="init")await Be(c.data.sampleRate,c.data.channels,c.data.bitrate,c.data.codec,c.data.wasmUrl),i=null;else if(c.type==="encode")i=ze(c.data.pcmData,c.data.numberOfFrames);else if(c.type==="close")ke(),i={closed:!0};else throw new Error("Unknown command type.")}catch(c){t=!1,d=c,i={closed:!0}}let m={id:a.id,success:t,data:i,error:d};C?C.postMessage(m):self.postMessage(m)},C=null;typeof self=="undefined"&&(C=v("worker_threads").parentPort);C?C.on("message",ge):self.addEventListener("message",a=>void ge(a.data));\n');
  }

  // packages/eac3/src/index.ts
  var Eac3Decoder = class extends import_mediabunny.CustomAudioDecoder {
    constructor() {
      super(...arguments);
      this.worker = null;
      this.nextMessageId = 0;
      this.pendingMessages = /* @__PURE__ */ new Map();
    }
    static supports(codec, config) {
      return codec === "eac3" || codec === "ac3";
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
          sampleRate: this.config.sampleRate,
          channels: this.config.numberOfChannels,
          codec: this.codec,
          wasmUrl: getCustomWasmUrl() ?? void 0
        }
      });
    }
    async decode(packet) {
      const packetData = packet.data.slice().buffer;
      const result = await this.sendCommand({
        type: "decode",
        data: { packetData }
      }, [packetData]);
      if (!result || !("pcmData" in result)) {
        return;
      }
      const audioSample = new import_mediabunny.AudioSample({
        data: new Float32Array(result.pcmData),
        format: "f32",
        numberOfChannels: result.channels,
        sampleRate: result.sampleRate,
        timestamp: packet.timestamp
      });
      this.onSample(audioSample);
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
        assert(this.worker);
        if (transferables) {
          this.worker.postMessage({ id, command }, transferables);
        } else {
          this.worker.postMessage({ id, command });
        }
      });
    }
  };
  var Eac3Encoder = class extends import_mediabunny.CustomAudioEncoder {
    constructor() {
      super(...arguments);
      this.worker = null;
      this.nextMessageId = 0;
      this.pendingMessages = /* @__PURE__ */ new Map();
      this.currentTimestamp = 0;
      this.chunkMetadata = {};
    }
    static supports(codec, config) {
      return codec === "eac3" || codec === "ac3";
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
      assert(this.config.bitrate);
      await this.sendCommand({
        type: "init",
        data: {
          sampleRate: this.config.sampleRate,
          channels: this.config.numberOfChannels,
          bitrate: this.config.bitrate,
          codec: this.codec,
          wasmUrl: getCustomWasmUrl() ?? void 0
        }
      });
      this.chunkMetadata = {
        decoderConfig: {
          codec: this.codec === "eac3" ? "ec-3" : "ac3",
          numberOfChannels: this.config.numberOfChannels,
          sampleRate: this.config.sampleRate
        }
      };
    }
    async encode(audioSample) {
      const sizePerChannel = audioSample.allocationSize({
        format: "f32-planar",
        planeIndex: 0
      });
      const requiredBytes = audioSample.numberOfChannels * sizePerChannel;
      const audioData = new ArrayBuffer(requiredBytes);
      const audioBytes = new Uint8Array(audioData);
      for (let i = 0; i < audioSample.numberOfChannels; i++) {
        audioSample.copyTo(audioBytes.subarray(i * sizePerChannel), {
          format: "f32-planar",
          planeIndex: i
        });
      }
      const result = await this.sendCommand({
        type: "encode",
        data: {
          pcmData: audioData,
          numberOfFrames: audioSample.numberOfFrames
        }
      }, [audioData]);
      assert(result && "encodedData" in result);
      const duration = audioSample.numberOfFrames / this.config.sampleRate;
      const encodedPacket = new import_mediabunny.EncodedPacket(
        new Uint8Array(result.encodedData),
        "key",
        this.currentTimestamp,
        duration
      );
      this.onPacket(encodedPacket, this.currentTimestamp === 0 ? this.chunkMetadata : void 0);
      if (this.currentTimestamp === 0) {
        this.chunkMetadata = {};
      }
      this.currentTimestamp += duration;
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
        assert(this.worker);
        if (transferables) {
          this.worker.postMessage({ id, command }, transferables);
        } else {
          this.worker.postMessage({ id, command });
        }
      });
    }
  };
  var registerEac3Decoder = (wasmUrl) => {
    if (wasmUrl) setEac3WasmUrl(wasmUrl);
    (0, import_mediabunny.registerDecoder)(Eac3Decoder);
  };
  var registerEac3Encoder = (wasmUrl) => {
    if (wasmUrl) setEac3WasmUrl(wasmUrl);
    (0, import_mediabunny.registerEncoder)(Eac3Encoder);
  };
  function assert(x) {
    if (!x) {
      throw new Error("Assertion failed.");
    }
  }
  return __toCommonJS(index_exports);
})();
if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, MediabunnyEac3)
