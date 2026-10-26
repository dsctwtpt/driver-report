// ============================================================
// 配送回報 LIFF 設定檔 — 只需要改這個檔案
// ============================================================
window.APP_CONFIG = {
  // LINE Developers → LINE Login channel → LIFF 分頁的 LIFF ID
  // 留空 = 示範模式（不連 LINE、不寫入後端，可直接在瀏覽器試操作）
  LIFF_ID: '2011109248-EhWPjjPx',

  // Apps Script 部署後的「網頁應用程式網址」（結尾是 /exec）
  API_URL: 'https://script.google.com/macros/s/AKfycbzAg9W0CWDezuxnFoJHr71Z4O4U3r_enl15iyeKO319JCJ1J_bfpN0LL230udjU-iFX/exec',

  // 首次綁定時讓司機點選的供應商清單
  SUPPLIERS: ['範例供應商A', '範例供應商B', '範例供應商C'],

  // 車單號格式檢查（正規表示式字串）。拿到 barcode 樣本後設定，可擋掉掃到非車單的條碼
  // 例：'^[A-Z]{2}\\d{10}$'；留空 = 不檢查
  ORDER_PATTERN: '^\\d{10,14}$',   // 車單號為純數字（樣本：8861001770620，13 碼）

  // 距離最近廠區在這個範圍內（公尺）就自動帶出，不用司機選
  AUTO_DETECT_RADIUS_M: 800,

  // 行程超過幾小時沒有動作就自動結案
  TRIP_AUTO_CLOSE_HOURS: 12,

  // 復原上一步的時限（分鐘）
  UNDO_WINDOW_MIN: 3,

  // 廠區清單：建議用 m365/build_sites_config.py 從 sites.xlsx 產生後貼上
  // type: 'normal' = 一般廠區（哨口→碼頭→交貨都即時按）
  //       'fab'    = 晶圓廠（進廠前按哨口，出廠後補按碼頭時間＋交貨離廠）
  // gate / dock: [緯度, 經度]；dock 沒有可省略
  // radius: 電子圍籬半徑（公尺）
  SITES: [
    // ↓↓↓ 以下為範例，請換成實際廠區 ↓↓↓
    { id: 'DEMO-HC1', name: '範例｜新竹晶圓一廠', type: 'fab',    gate: [24.7740, 121.0110], dock: [24.7752, 121.0125], radius: 400 },
    { id: 'DEMO-HC2', name: '範例｜新竹晶圓二廠', type: 'fab',    gate: [24.7806, 121.0030], radius: 400 },
    { id: 'DEMO-TY',  name: '範例｜桃園物流中心', type: 'normal', gate: [24.9937, 121.3010], dock: [24.9941, 121.3022], radius: 300 },
    { id: 'DEMO-TC',  name: '範例｜台中科園廠',   type: 'normal', gate: [24.2105, 120.6180], radius: 400 },
  ],
};
