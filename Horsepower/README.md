## Charts

This project uses [ECharts](https://echarts.apache.org/) for displaying dynamic data maintaining high performance via the [jsDelivr CDN](https://www.jsdelivr.com/package/npm/echarts)

**License:** ECharts is licensed under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

---

<br>

### Pushing to webhost to reduce hits:

-    npx esbuild js/main.js --bundle --minify --format=esm --outfile=bundle.js --watch
-    change switch script in index.html
     -    or inline bundle.js / style.css into index.html
