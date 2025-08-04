// src/core/plugins.js

const pluginRegistry = new Map();

/**
 * Registers a global plugin that will be included in every Snapdom context
 * @param {Object} plugin - Plugin object with a unique `name` and optional `hooks`
 * @throws {Error} If plugin name is not provided
 */
export function use(plugin) {
  if (!plugin?.name) throw new Error("Plugin name is required");
  if (pluginRegistry.has(plugin.name)) {
    console.warn(`Overwriting existing plugin "${plugin.name}"`);
  }
  pluginRegistry.set(plugin.name, plugin);
}

/**
 * Returns all globally registered plugins
 * @returns {Array<Object>} Array of plugin objects
 */
export function getGlobalPlugins() {
  return Array.from(pluginRegistry.values());
}

/**
 * Clears all registered plugins — primarily for testing purposes
 */
export function clearPlugins() {
  pluginRegistry.clear();
}

/**
 * Normalizes an array of plugin entries (objects or name references)
 * @param {Array<Object|string>} plugins - Plugin list
 * @param {boolean} [debug=false] - Whether to log warnings for invalid plugins
 * @returns {Array<Object>} Normalized list of plugin objects
 */
export function normalizePlugins(plugins, debug = false) {
  const normalized = [];
  for (const entry of plugins) {
    if (typeof entry === 'string') {
      const global = pluginRegistry.get(entry);
      if (global) normalized.push(global);
      else if (debug) console.warn(`Unknown plugin name: ${entry}`);
    } else if (entry?.name && typeof entry === 'object') {
      // Check if it's an override of a global plugin
      const base = pluginRegistry.get(entry.name);
      if (base) {
        normalized.push({
          ...base,
          options: { ...base.options, ...entry.options },
        });
      } else {
        normalized.push(entry);
      }
    } else if (debug) {
      console.warn("Invalid plugin configuration skipped", entry);
    }
  }
  return normalized;
}

/**
 * Runs a lifecycle hook across all plugins
 * @param {string} hookName - The lifecycle hook name (e.g. 'beforeClone')
 * @param {Object} context - The context object to pass to each hook
 */
export async function runHook(hookName, context) {
  const allPlugins = normalizePlugins(context.plugins || [], context.options?.debug);
  for (const plugin of allPlugins) {
    const hookFn = plugin[hookName];
    if (typeof hookFn === 'function') {
      await hookFn(context);
    }
  }
}

/* 

## 🔌 Plugin System

Snapdom supports a powerful **plugin system** that allows you to extend and customize the capture and export process with lifecycle hooks.

### 💡 Usage

There are two main ways to use plugins:

#### 1. **Register globally with `snapdom.use()`**

```js
import { snapdom } from 'snapdom';
import timeStampPlugin from './plugins/timeStamp.js';

snapdom.use(timeStampPlugin);

await snapdom.toImg(element); // plugin will be applied
```

#### 2. **Pass locally in the `plugins` array**

```js
await snapdom.toImg(element, {
  plugins: [timeStampPlugin]
});
```

You can also combine both global and local plugins. Local plugins take precedence when there's a name conflict.

```js
await snapdom.toImg(element, {
  plugins: [
    { name: 'timeStamp', options: { format: 'utc' } }
  ]
});
```

To ignore global plugins:

```js
await snapdom.toImg(element, {
  plugins: [...],
  ignoreGlobalPlugins: true
});
```

---

### 🧩 Plugin Structure

A plugin is simply an object with a `name` and any number of async lifecycle hooks:

```js
const timeStampPlugin = {
  name: 'timeStamp',
  beforeClone({ element }) {
    console.log('About to clone', element);
  },
  afterRender({ clone }) {
    const stamp = document.createElement("div");
    stamp.textContent = new Date().toISOString();
    stamp.style.position = 'absolute';
    clone.appendChild(stamp);
  }
};
```

### ⏱ Available hooks

Plugins can implement any of the following hooks (all are optional and `await`ed):

* `beforeClone(context)`
* `afterClone(context)`
* `beforeRender(context)`
* `afterRender(context)`
* `afterExport(context)`

Each hook receives the same `context` object used internally by Snapdom.

 */