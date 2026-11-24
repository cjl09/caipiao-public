# 小彩日记

打开 index.html。首页每天可掷一次骰子。单数休息，双数从 10、20、30、50 元中随机选一个刮刮乐金额。大乐透和双色球分别显示最近 50 期。

## 手动更新开奖

1. 在对应彩种页面点「录入开奖」，填写期号、日期和两组号码。
2. 点「保存到本机」。号码按期号从新到旧排列，同一期可重新录入更正。
3. 要让公网访客也看到更新，在弹窗里点「下载开奖数据」，用下载的 draws.js 覆盖 GitHub 仓库中网站发布目录下的同名文件并提交。这个文件包含两个彩种各自最新的 50 期。

本机录入存在浏览器里。发布的历史数据来自 draws.js，无需在线数据接口。

## GitHub Pages

将 index.html、site.css、site.js、draws.js 和 .nojekyll 放到发布目录。首次发布可在仓库 Settings → Pages 选择发布分支及对应目录。已有 Pages 站点可沿用现有配置。

旧版选号与记录页面仍可通过 journal-archive.html 打开，需与旧版 app.js 和 style.css 同目录。旧记录在原浏览器、原站点地址下读取。

## 初始开奖数据

- 大乐透历史号码表截至 26134 期（2026-11-23）。[历史号码表](https://9011.com.cn/lottery/dlt/trend?omit=1&period=2000&view=history)，[重庆体彩 26134 期开奖公告](https://www.cqtcw.net/web/aritcle/1574545080617410560/web/content_1574545080617410560.htm)。
- 双色球历史号码截至 2026134 期（2026-11-22）。[上海市福利彩票发行中心往期开奖](https://www.swlc.net.cn/lottery/ssq.html?limit=50&view=previous)。
