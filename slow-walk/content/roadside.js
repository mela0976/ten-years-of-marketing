// 路上小問依章節順序排列；只補充既有內容，不參與人格判定。
const roadside = [
  // 出處：content.js 第 1 章 takeaway；game3d/src/gamify-content.js quick.questions 第 1 題。
  {
    prompt: '報酬率最高，生意就最好？',
    options: ['是', '不一定'],
    answer: 1,
    reveal: '報表漂亮，不等於生意變大。',
  },
  // 出處：content.js 第 2 章 game.reveal。
  {
    prompt: '銀行收回技術後，外包成本占比降到？',
    options: ['15%', '85%'],
    answer: 0,
    reveal: '技術外包成本占比從 85% 降到 15%。',
  },
  // 出處：content.js 第 3 章 game.reveal。
  {
    prompt: '運動品牌後來怎麼分配預算？',
    options: ['品牌四、成效六', '品牌六、成效四'],
    answer: 1,
    reveal: '它後來把比例改成品牌六、成效四。',
  },
  // 出處：content.js 第 4 章 game.revealByCount。
  {
    prompt: '多少 Z 世代使用廣告封鎖軟體？',
    options: ['一半', '全部'],
    answer: 0,
    reveal: 'Z 世代有一半用廣告封鎖軟體。',
  },
  // 出處：content.js 第 5 章 game.reveal。
  {
    prompt: '多少人認為環保產品比較貴？',
    options: ['81%', '85%'],
    answer: 1,
    reveal: '同一份調查裡，85% 認為環保產品比較貴。',
  },
  // 出處：content.js 第 6 章 takeaway。
  {
    prompt: '內容不用錢之後，稀缺的是？',
    options: ['更多素材', '被記得'],
    answer: 1,
    reveal: '內容不用錢之後，稀缺的是被記得。',
  },
  // 出處：game3d/src/gamify-content.js quick.questions 第 4 題；content.js 第 7 章 takeaway。
  {
    prompt: '通路廣告成效，由誰打分數？',
    options: ['通路平台自己', '獨立第三方', '品牌自己'],
    answer: 0,
    reveal: '通路平台自己替廣告成效打分數。',
  },
  // 出處：content.js 第 8 章 takeaway。
  {
    prompt: '演算法放大的是哪些人？',
    options: ['所有新客', '本來就打得到的人'],
    answer: 1,
    reveal: '演算法只放大你本來就打得到的人。',
  },
  // 出處：content.js 第 9 章 takeaway。
  {
    prompt: 'AI 幫人買東西，品牌要讓人？',
    options: ['想買', '只比規格'],
    answer: 0,
    reveal: 'AI 可以幫人買東西，品牌要讓人想買。',
  },
  // 出處：content.js 第 10 章 takeaway。
  {
    prompt: '走過十年，什麼不能外包？',
    options: ['技術', '判斷'],
    answer: 1,
    reveal: '判斷不能外包。',
  },
];

export default roadside;
