"use strict";
var Metamuxer = (() => {
  // src/index.ts
  console.log("hi");
})();
if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Metamuxer)
