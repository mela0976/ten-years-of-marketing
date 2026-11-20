// 路上小問依章節順序排列；只補充既有內容，不參與人格判定。
const roadside = [
  // 出處：content.js 第 1 章 game.options、takeaway；game3d 快問快答第 1 題。
  {
    prompt: '2018 年鑑的結案題例，報酬率最高就代表生意最好？',
    options: ['是', '不一定'],
    answer: 1,
    reveal: '報酬率最高的報告裡，購買者九成是老客。光看報酬率，無法判斷生意有沒有變大。',
  },
  // 出處：content.js 第 2 章 source、game.reveal。
  {
    prompt: '2019 年鑑中，星展銀行的技術外包成本占比降到？',
    options: ['15%', '85%'],
    answer: 0,
    reveal: '星展銀行先花五年把技術收回自己手上，技術外包成本占比從 85% 降到 15%。',
  },
  // 出處：content.js 第 3 章 game.reveal。
  {
    prompt: '2020 年鑑中，那家運動品牌後來怎麼分配預算？',
    options: ['品牌四、成效六', '品牌六、成效四'],
    answer: 1,
    reveal: '案例裡有 65% 的銷售來自品牌活動，這家運動品牌後來把預算改成品牌六、成效四。',
  },
  // 出處：content.js 第 4 章 source、game.revealByCount。
  {
    prompt: '2019 年鑑中，多少 Z 世代用廣告封鎖軟體？',
    options: ['一半', '全部'],
    answer: 0,
    reveal: '年鑑記載，有一半使用廣告封鎖軟體，也有一半每月清一次瀏覽器的 Cookie。',
  },
  // 出處：content.js 第 5 章 game.prompt、game.reveal。
  {
    prompt: '2022 年鑑的台灣永續調查，多少人覺得環保產品較貴？',
    options: ['81%', '85%'],
    answer: 1,
    reveal: '85% 覺得環保產品較貴。81% 回答的是另一題，認為省錢比救地球重要。',
  },
  // 出處：content.js 第 6 章 chat.text、takeaway。
  {
    prompt: '依 2023 年鑑，AI 讓內容不用錢之後，稀缺的是？',
    options: ['更多素材', '被記得'],
    answer: 1,
    reveal: 'AI 可以做出大量素材，但能做多少，和看完會不會記得，是兩回事。',
  },
  // 出處：game3d 快問快答第 4 題；content.js 第 7 章 chat.text、game、source。
  {
    prompt: '2024 年鑑談台灣通路廣告，誰替成效打分數？',
    options: ['通路平台自己', '獨立第三方', '品牌自己'],
    answer: 0,
    reveal: '通路平台握有廣告版位和顧客資料，從曝光追到結帳，也由自己評估成效。',
  },
  // 出處：content.js 第 8 章 game、takeaway。
  {
    prompt: '2025 年這一站，自動優化模擬放大哪些人？',
    options: ['所有新客', '本來就打得到的人'],
    answer: 1,
    reveal: '模擬裡，報表成效愈來愈高，新客比例卻一直下降，放大的是本來就打得到的人。',
  },
  // 出處：content.js 第 9 章 game.revealSame、takeaway。
  {
    prompt: '依 2026 年鑑，AI 能幫人買東西，品牌要讓人？',
    options: ['想買', '只比規格'],
    answer: 0,
    reveal: 'AI 能依價格與規格代選，品牌要先讓人有想買的理由。',
  },
  // 出處：content.js 第 10 章 chat.text、takeaway。
  {
    prompt: '2027 終章回看十年，什麼不能外包？',
    options: ['技術', '判斷'],
    answer: 1,
    reveal: '自動引擎讓報表漂亮，卻對某些客人定比較高的價。該不該繼續用，仍要有人判斷。',
  },
];

export default roadside;
