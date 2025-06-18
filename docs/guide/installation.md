# Installation

Install Mediabunny using your favorite package manager:

::: code-group
```bash [npm]
npm install mediabunny
```
```bash [yarn]
yarn add mediabunny
```
```bash [pnpm]
pnpm add mediabunny
```
```bash [bun]
bun add mediabunny
```
:::

Then, simply import it like this:
```ts
import { ... } from 'mediabunny'; // ESM
const { ... } = require('mediabunny'); // or CommonJS
```

ESM is preferred because it gives you tree shaking.

You can also just include the library using a script tag in your HTML:
```html
<script src="path/to/mediabunny.js"></script>
```

You can download the built distribution file from the [releases page](https://github.com/Vanilagy/mediabunny/releases).