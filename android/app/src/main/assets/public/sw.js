/**
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// If the loader is already loaded, just stop.
if (!self.define) {
  let registry = {};

  // Used for `eval` and `importScripts` where we can't get script URL by other means.
  // In both cases, it's safe to use a global var because those functions are synchronous.
  let nextDefineUri;

  const singleRequire = (uri, parentUri) => {
    uri = new URL(uri + ".js", parentUri).href;
    return registry[uri] || (
      
        new Promise(resolve => {
          if ("document" in self) {
            const script = document.createElement("script");
            script.src = uri;
            script.onload = resolve;
            document.head.appendChild(script);
          } else {
            nextDefineUri = uri;
            importScripts(uri);
            resolve();
          }
        })
      
      .then(() => {
        let promise = registry[uri];
        if (!promise) {
          throw new Error(`Module ${uri} didn’t register its module`);
        }
        return promise;
      })
    );
  };

  self.define = (depsNames, factory) => {
    const uri = nextDefineUri || ("document" in self ? document.currentScript.src : "") || location.href;
    if (registry[uri]) {
      // Module is already loading or loaded.
      return;
    }
    let exports = {};
    const require = depUri => singleRequire(depUri, uri);
    const specialDeps = {
      module: { uri },
      exports,
      require
    };
    registry[uri] = Promise.all(depsNames.map(
      depName => specialDeps[depName] || require(depName)
    )).then(deps => {
      factory(...deps);
      return exports;
    });
  };
}
define(['./workbox-7e5eb42b'], (function (workbox) { 'use strict';

  self.skipWaiting();
  workbox.clientsClaim();
  /**
   * The precacheAndRoute() method efficiently caches and responds to
   * requests for URLs in the manifest.
   * See https://goo.gl/S9QRab
   */
  workbox.precacheAndRoute([{
    "url": "registerSW.js",
    "revision": "1872c500de691dce40960bb85481de07"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "af63a8efef5d3225d4d101f7ed5a008a"
  }, {
    "url": "pwa-512x512.png",
    "revision": "0542f0ac55fae3d9c9ebe55891a858a0"
  }, {
    "url": "pwa-192x192.png",
    "revision": "2fe0e7602482b9ad0192f161924e0334"
  }, {
    "url": "index.html",
    "revision": "8743919d16ef262629d6d4d44ccaed0f"
  }, {
    "url": "icon.svg",
    "revision": "f461b9a634faba675ed848c2a5cd325d"
  }, {
    "url": "firebase-messaging-sw.js",
    "revision": "cb78cb30273893fcd8cd3b4d43178da0"
  }, {
    "url": "apple-touch-icon.png",
    "revision": "f7d14302de3be462879202f676cd0085"
  }, {
    "url": "assets/web-CeoA9BUg.js",
    "revision": null
  }, {
    "url": "assets/web-CIhqAzFH.js",
    "revision": null
  }, {
    "url": "assets/web-CHFFk_v2.js",
    "revision": null
  }, {
    "url": "assets/index-CrsMIJZm.js",
    "revision": null
  }, {
    "url": "assets/index-C6zcpsjD.css",
    "revision": null
  }, {
    "url": "apple-touch-icon.png",
    "revision": "f7d14302de3be462879202f676cd0085"
  }, {
    "url": "icon.svg",
    "revision": "f461b9a634faba675ed848c2a5cd325d"
  }, {
    "url": "pwa-192x192.png",
    "revision": "2fe0e7602482b9ad0192f161924e0334"
  }, {
    "url": "pwa-512x512.png",
    "revision": "0542f0ac55fae3d9c9ebe55891a858a0"
  }, {
    "url": "pwa-maskable-512x512.png",
    "revision": "af63a8efef5d3225d4d101f7ed5a008a"
  }, {
    "url": "manifest.webmanifest",
    "revision": "9801859d4e498c7ff2bf9b5073fb318f"
  }], {});
  workbox.cleanupOutdatedCaches();
  workbox.registerRoute(new workbox.NavigationRoute(workbox.createHandlerBoundToURL("index.html"), {
    denylist: [/^\/api\//, /^\/uploads\//, /^\/ws/]
  }));

}));
