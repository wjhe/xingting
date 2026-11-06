import type { Activity, Ending, Stat, StoryEvent } from './types';
import { DAILY_EVENTS, MAIN_EVENTS, SIDE_EVENTS } from './story';

export const STAT_INFO: Record<Stat, { name: string; color: string; icon: string }> = {
  stamina: { name: '体力', color: '#b78b59', icon: 'heart' }, intellect: { name: '智力', color: '#739aab', icon: 'book' },
  charm: { name: '魅力', color: '#cc879a', icon: 'flower' }, grace: { name: '气质', color: '#a18bb7', icon: 'sparkle' },
  combat: { name: '武艺', color: '#b17e69', icon: 'sword' }, kindness: { name: '品德', color: '#84a385', icon: 'leaf' },
};
export const ACTIVITIES: Activity[] = [
  { id: 'literature', name: '文学课', category: 'learn', icon: 'book', description: '在书页之间，认识更广阔的世界。', gold: -60, stress: 8, gains: { intellect: 12, grace: 3 } },
  { id: 'painting', name: '绘画课', category: 'learn', icon: 'palette', description: '把心中的小小风景，画成一幅画。', gold: -65, stress: 6, gains: { charm: 7, grace: 9 } },
  { id: 'dance', name: '舞蹈课', category: 'learn', icon: 'flower', description: '随着琴声，让脚步轻盈起来。', gold: -70, stress: 10, gains: { charm: 12, stamina: 3, grace: 4 } },
  { id: 'sword', name: '剑术课', category: 'learn', icon: 'sword', description: '勇气不只在剑锋，也在守护之心。', gold: -65, stress: 12, gains: { combat: 14, stamina: 6 } },
  { id: 'magic', name: '魔法课', category: 'learn', icon: 'star', description: '倾听星辰低语，点亮第一束魔法。', gold: -90, stress: 12, gains: { intellect: 15, combat: 6 }, unlock: { stat: 'intellect', value: 80 } },
  { id: 'etiquette', name: '礼仪课', category: 'learn', icon: 'crown', description: '优雅是待人温柔，也是心有分寸。', gold: -80, stress: 9, gains: { grace: 15, kindness: 4 }, age: 12 },
  { id: 'farm', name: '农场帮工', category: 'work', icon: 'leaf', description: '播种、浇水，收获泥土的馈赠。', gold: 100, stress: 14, gains: { stamina: 9, kindness: 3 } },
  { id: 'cafe', name: '花园茶屋', category: 'work', icon: 'cup', description: '一杯热茶，一份认真招待的心意。', gold: 120, stress: 13, gains: { charm: 6, grace: 3 } },
  { id: 'church', name: '教堂义工', category: 'work', icon: 'sun', description: '帮修女照顾花圃，也照顾需要的人。', gold: 60, stress: -3, gains: { kindness: 12, grace: 2 } },
  { id: 'library', name: '图书馆助理', category: 'work', icon: 'book', description: '在旧书与故事之间整理时光。', gold: 130, stress: 11, gains: { intellect: 8, kindness: 2 }, unlock: { stat: 'intellect', value: 60 } },
  { id: 'guard', name: '城门见习', category: 'work', icon: 'shield', description: '守望城门，向真正的骑士学习。', gold: 155, stress: 18, gains: { combat: 8, stamina: 4 }, unlock: { stat: 'combat', value: 80 }, age: 12 },
  { id: 'home', name: '在家休息', category: 'rest', icon: 'home', description: '睡个懒觉，让日子慢一点也没关系。', gold: 0, stress: -27, gains: { stamina: 3, kindness: 2 } },
  { id: 'free', name: '自由时光', category: 'rest', icon: 'star', description: '不追赶目标，把今天留给她自己的小世界。', gold: 0, stress: -20, gains: {} },
  { id: 'walk', name: '花园散步', category: 'rest', icon: 'flower', description: '看花开，听风来，给心情放个假。', gold: -15, stress: -20, gains: { charm: 3, kindness: 4 } },
  { id: 'vacation', name: '海边度假', category: 'rest', icon: 'sun', description: '带上野餐篮，去看远方的海。', gold: -120, stress: -48, gains: { stamina: 8, grace: 5 } },
  { id: 'forest', name: '微光森林', category: 'adventure', icon: 'tree', description: '寻找萤火与奇遇。建议武艺 15、体力 40；准备更充分，交锋更从容。', gold: 20, stress: 14, gains: { stamina: 6, combat: 6, kindness: 3 } },
  { id: 'ruins', name: '古塔遗迹', category: 'adventure', icon: 'castle', description: '石壁上刻着失落的知识。建议武艺 100、体力 40；解锁后也要留意体力。', gold: 65, stress: 22, gains: { intellect: 10, combat: 9 }, unlock: { stat: 'combat', value: 100 }, age: 12 },
  { id: 'mountain', name: '星落山脉', category: 'adventure', icon: 'mountain', description: '越过云层寻找星海。建议武艺 220、体力 40；智力与气质也能帮助交锋。', gold: 120, stress: 27, gains: { stamina: 10, combat: 14 }, unlock: { stat: 'combat', value: 220 }, age: 14 },
];

export const EVENTS: StoryEvent[] = [
  ...MAIN_EVENTS, ...SIDE_EVENTS, ...DAILY_EVENTS,
  { id: 'kitten', icon: 'heart', title: '雨檐下的小客人', text: '回家的路上下起了雨。艾莉在屋檐下发现了一只发抖的小猫，抬头小声问你：“我们可以帮帮它吗？”', choices: [
    { label: '把它抱回家照顾', outcome: { text: '小猫在壁炉旁睡着了。她望着你笑，眼睛亮得像星星。', gold: -20, gains: { kindness: 12 }, bond: 5, flag: 'cat' } },
    { label: '一起为它寻找主人', outcome: { text: '你们敲开一扇扇门，终于找到了焦急的主人。她学会了责任。', gains: { kindness: 8, intellect: 4 }, bond: 3 } },
  ] },
  { id: 'book', icon: 'book', title: '旧书店的星图', text: '旧书店老板送来一本缺了封面的星图。她趴在桌边翻了一整晚：“原来，天上的星星也有名字。”', choices: [
    { label: '陪她一起认识星空', outcome: { text: '这个夜晚，你们给窗外最亮的星星取了一个只有彼此知道的名字。', gains: { intellect: 10 }, bond: 6, stress: -8 } },
    { label: '鼓励她自己研究', outcome: { text: '她认真写满了三页笔记，兴奋地把新发现讲给你听。', gains: { intellect: 15, grace: 3 }, bond: 2 } },
  ] },
  { id: 'friend', icon: 'flower', title: '一封花香的邀请', text: '邻居的孩子送来一封带着干花的信，邀请她参加庭院茶会。她有些期待，也有些不知所措。', choices: [
    { label: '一起准备小点心', outcome: { text: '带着微微烤焦的小饼干，她收获了第一个真正的朋友。', gold: -15, gains: { charm: 10, kindness: 4 }, stress: -10 } },
    { label: '教她大方地介绍自己', outcome: { text: '她在镜子前练习了许多次。茶会上，那个自信的笑容恰到好处。', gains: { grace: 10, charm: 5 } } },
  ] },
  { id: 'sword', icon: 'sword', title: '老骑士的木剑', text: '广场上，一位退役骑士正在教孩子们挥剑。她站在旁边看了好久，悄悄握紧了自己的手。', choices: [
    { label: '鼓励她上前试一试', outcome: { text: '手心磨出了小水泡，她却舍不得放下木剑。“我也想保护重要的人。”', gains: { combat: 14, stamina: 4 }, stress: 5 } },
    { label: '听老骑士讲冒险故事', outcome: { text: '勇气、承诺、回家的路。她把这些故事认真地记在了心里。', gains: { kindness: 10, intellect: 5 }, bond: 3 } },
  ] },
  { id: 'painting', icon: 'palette', title: '画里的人', text: '整理房间时，你看到一幅藏在抽屉里的画。画上的你站在花园里，笑得特别灿烂。', choices: [
    { label: '认真把画挂在墙上', outcome: { text: '“其实画得还不够好……”她红了脸，但一整天都在偷偷微笑。', gains: { charm: 8, grace: 6 }, bond: 8 } },
    { label: '送她一套新的画笔', outcome: { text: '她用新画笔，在画上又添了一个牵着你的自己。', gold: -35, gains: { grace: 14 }, bond: 5 } },
  ] },
  { id: 'market', icon: 'coin', title: '集市的找零', text: '买面包回来后，她发现老板多找了二十枚金币。她把硬币放在掌心，安静地等着你的回答。', choices: [
    { label: '一起把钱送回去', outcome: { text: '老板笑着送了她一块蜂蜜饼。“诚实的心，比金币更珍贵。”', gains: { kindness: 15 }, bond: 4 } },
    { label: '让她自己做决定', outcome: { text: '想了很久，她还是跑回了面包店。这是她自己的选择。', gains: { kindness: 10, intellect: 5 }, bond: 3 } },
  ] },
  { id: 'dream', icon: 'star', title: '枕边的小小愿望', text: '睡前，她忽然问你：“长大以后，我一定要成为很厉害的人吗？”窗外的月光落在被子上。', choices: [
    { label: '你快乐，就已经很好了', outcome: { text: '她轻轻靠过来。“那我也希望你一直快乐。”', bond: 10, stress: -18, gains: { kindness: 5 } } },
    { label: '找到你真正喜欢的事就好', outcome: { text: '她认真想了想，在日记本上写下了一个新的愿望。', bond: 6, gains: { intellect: 8, grace: 5 }, stress: -8 } },
  ] },
  { id: 'flowers', icon: 'leaf', title: '第一朵属于她的花', text: '窗台上的种子终于开花了。她从清晨一直守到午后，只为让你看到花瓣完全展开的一刻。', choices: [
    { label: '为这朵花画一张纪念画', outcome: { text: '画纸上有花、有阳光，还有你们并肩坐着的影子。', gains: { grace: 9, kindness: 6 }, bond: 5 } },
    { label: '一起种下更多的种子', outcome: { text: '她把新的花盆排得整整齐齐。“明年这里会是一座小花园。”', gains: { stamina: 5, kindness: 12 }, stress: -6 } },
  ] },
  { id: 'music', icon: 'music', title: '广场上的提琴声', text: '傍晚的广场，有位旅人拉起了小提琴。她情不自禁地转了个圈，裙摆像花一样散开。', choices: [
    { label: '鼓掌，陪她跳完这一曲', outcome: { text: '她跳错了好几步，你们却笑得停不下来。这是很普通，也很珍贵的一天。', gains: { charm: 12, grace: 4 }, stress: -12, bond: 4 } },
    { label: '请旅人教她一点乐理', outcome: { text: '她学会了第一个音阶，也记住了旅人说的：音乐要先听见自己的心。', gold: -20, gains: { intellect: 8, grace: 12 } } },
  ] },
  { id: 'lost', icon: 'compass', title: '森林里的岔路', text: '采蘑菇时，她发现一条没走过的小路。树枝上系着褪色的缎带，像是有人留下的路标。', choices: [
    { label: '做好标记，勇敢探索', outcome: { text: '小路尽头是一片铺满蓝色野花的山谷。她拾到一枚古老的银币。', gains: { combat: 10, stamina: 6 }, gold: 40, stress: 5 } },
    { label: '记下位置，改天再来', outcome: { text: '谨慎也是勇气的一部分。她画了一张歪歪扭扭、但准确的小地图。', gains: { intellect: 10, kindness: 3 }, bond: 3 } },
  ] },
  { id: 'exam', minAge: 12, icon: 'book', title: '没有答对的那道题', text: '她把试卷藏在身后，眼睛红红的。“我明明很努力了，为什么还是做不好？”', choices: [
    { label: '先抱抱她，再一起看看题目', outcome: { text: '眼泪干了以后，那道题似乎也没有那么难了。她知道，成绩之外还有一个永远支持自己的人。', gains: { intellect: 12 }, bond: 7, stress: -12 } },
    { label: '告诉她，犯错也是成长的一部分', outcome: { text: '她把错题认真抄进本子，写下了“下次再试一次”。', gains: { intellect: 15, kindness: 4 }, bond: 4 } },
  ] },
  { id: 'friendship', minAge: 12, icon: 'heart', title: '和朋友吵架的傍晚', text: '茶会回来的路上，她一直低着头。原来，最好的朋友误会了她。她想解释，却又有些生气。', choices: [
    { label: '陪她写一封真诚的信', outcome: { text: '第二天，回信里夹着一朵小花。有些友谊经过雨天，反而更加明亮。', gains: { kindness: 14, grace: 5 }, bond: 4 } },
    { label: '给她一点时间，自己理清心情', outcome: { text: '她在花园里坐了一下午，最终决定先说出那句“我们聊聊吧”。', gains: { grace: 10, intellect: 7 }, stress: -8 } },
  ] },
  { id: 'sewing', minAge: 12, icon: 'wardrobe', title: '袖口上的小花', text: '旧裙子的袖口磨破了。她拿着针线，想把破洞绣成一朵小小的雏菊。', choices: [
    { label: '坐下来，陪她一针一线地缝', outcome: { text: '花瓣有些歪，她却穿得格外骄傲。这件裙子，又多了一层回忆。', gains: { grace: 12, kindness: 5 }, bond: 5 } },
    { label: '夸夸她，把创意放心交给她', outcome: { text: '她不仅绣好了袖口，还在你的手帕上也绣了一朵。', gains: { charm: 10, grace: 8 }, bond: 3 } },
  ] },
  { id: 'mentor', minAge: 14, icon: 'sword', title: '骑士的第二次邀请', text: '老骑士又来到城里。这次，他邀请她参加一次正式的训练。“愿不愿意走得更远一点？”', choices: [
    { label: '支持她，接受新的挑战', outcome: { text: '日落时，她带着一身尘土回来，眼神却格外坚定。木剑早已不再沉重。', gains: { combat: 22, stamina: 10 }, stress: 8, bond: 3 } },
    { label: '先听听她自己的想法', outcome: { text: '她认真说完自己的担忧与期待。你发现，她已经能够为自己的选择负责。', gains: { kindness: 12, grace: 10 }, bond: 8 } },
  ] },
  { id: 'stage', minAge: 14, icon: 'music', title: '帷幕拉开之前', text: '小剧院缺一位临时演员，她意外地得到了邀请。上台前，她握着你的手，掌心都是汗。', choices: [
    { label: '告诉她：我会坐在第一排', outcome: { text: '聚光灯下，她看见了你的笑容。那一瞬间，台词和勇气都回来了。', gains: { charm: 18, grace: 10 }, bond: 6 } },
    { label: '陪她再练最后一遍', outcome: { text: '一遍又一遍的练习，终于变成了舞台上自然舒展的姿态。', gains: { grace: 18, intellect: 8 }, stress: -6 } },
  ] },
  { id: 'independent', minAge: 14, icon: 'coin', title: '第一份自己的薪水', text: '她把一小袋金币放在餐桌上，推到你面前：“这次的晚餐，我来请。”', choices: [
    { label: '郑重地谢谢她，请她决定菜单', outcome: { text: '晚餐并不昂贵，但她一整晚都笑得很开心。付出被看见的感觉，像阳光一样温暖。', gold: 40, gains: { kindness: 10 }, bond: 8 } },
    { label: '留一半，帮她存下另一半', outcome: { text: '你们给储蓄罐贴上“未来的冒险”标签。她第一次认真计算起自己的梦想。', gold: 60, gains: { intellect: 12 }, bond: 4 } },
  ] },
  { id: 'choice', minAge: 16, icon: 'compass', title: '想要成为的自己', text: '她在窗边写了很久，最后把日记递给你。上面列着许多未来，最后一句是：“我想选一条属于自己的路。”', choices: [
    { label: '无论选哪条路，我都会支持你', outcome: { text: '她没有再问你哪一个答案正确。她知道，自己终于可以带着爱，勇敢走向远方。', gains: { kindness: 15, grace: 12 }, bond: 10, stress: -10 } },
    { label: '一起认真分析每个选择', outcome: { text: '你们聊到月亮升起。未来仍有未知，但地图上的线条已经渐渐清晰。', gains: { intellect: 18, grace: 8 }, bond: 6 } },
  ] },
  { id: 'letter', minAge: 16, icon: 'book', title: '寄往远方的信', text: '城外学院寄来一封介绍信。她看了很久，问你：“如果以后离家很远，你会想我吗？”', choices: [
    { label: '当然会，但我更想看见你快乐', outcome: { text: '她把信仔细收好，又在背面写下了回家的地址。有些牵挂，让远行也变得温柔。', gains: { intellect: 15, kindness: 10 }, bond: 8 } },
    { label: '约定每个月都给彼此写信', outcome: { text: '她认真选了一叠淡绿色的信纸。“第一封，就从出发那天开始写。”', gains: { grace: 16, charm: 8 }, bond: 7 } },
  ] },
  { id: 'portrait', minAge: 16, icon: 'palette', title: '和从前的自己合影', text: '整理旧物时，她翻出了十岁那年的画像。她笑着比了比自己的身高：“原来，真的长大了好多。”', choices: [
    { label: '再为她画一幅现在的画像', outcome: { text: '两幅画并排放着，中间隔着的，是许许多多个被认真度过的日子。', gains: { charm: 16, grace: 12 }, bond: 8 } },
    { label: '一起重走小时候的花园小径', outcome: { text: '小径似乎变短了，蔷薇却开得和从前一样。她自然地挽起你的手。', gains: { stamina: 10, kindness: 16 }, bond: 7, stress: -15 } },
  ] },
  { id: 'promise', minAge: 17, icon: 'star', title: '下一个春天的约定', text: '她在庭院里种下了一棵小树，说想看它长成能遮阴的模样。风吹过来，她的声音温柔又坚定。', choices: [
    { label: '约好以后每个春天都回来看看', outcome: { text: '她在树旁埋下一只装着信的盒子。等到树长大，你们再一起打开它。', gains: { kindness: 18, grace: 10 }, bond: 10, flag: 'promise' } },
    { label: '把这份心意画进成长手账', outcome: { text: '手账的最后几页还空着。她拿起画笔，画下了你、她，以及未来茂盛的树。', gains: { grace: 18, charm: 12 }, bond: 7, flag: 'promise' } },
  ] },
];

export const ENDINGS: Ending[] = [
  { id: 'star', title: '星庭的继承者', subtitle: '她的光，终于照亮了整个王国', icon: 'crown', requires: { intellect: 300, charm: 260, grace: 300, kindness: 250 }, bond: 75, priority: 100,
    text: '王宫的邀请函送到时，她正在庭院里浇花。多年积累的学识、优雅与善意，让她成为王国年轻的执政官。她没有搬走窗台上的那盆花——那是故事开始的地方。' },
  { id: 'sage', title: '星塔贤者', subtitle: '所有不眠的夜晚，都化作了星光', icon: 'star', requires: { intellect: 430, combat: 180 }, priority: 90,
    text: '她带着亲手绘制的星图进入高塔，成为了研究星辰魔法的年轻贤者。每当发现一颗新星，她总会给家里写一封很长的信。' },
  { id: 'knight', title: '蔷薇骑士', subtitle: '以勇气为剑，以温柔为盾', icon: 'sword', requires: { combat: 420, stamina: 250, kindness: 120 }, priority: 85,
    text: '授勋那天，她把骑士徽章放进你的掌心。那个曾经握不稳木剑的孩子，已经能够保护一整座城。“这一次，换我来保护你。”' },
  { id: 'artist', title: '宫廷画家', subtitle: '她把爱过的世界，画成了永恒', icon: 'palette', requires: { grace: 370, charm: 230 }, priority: 80,
    text: '她的画作挂进了王宫，但最珍视的作品，仍是小时候画下的那幅庭院。她说，世上最难画的不是风景，而是回家的心情。' },
  { id: 'dancer', title: '月光舞者', subtitle: '从花园到舞台，每一步都闪着光', icon: 'flower', requires: { charm: 400, grace: 180, stamina: 120 }, priority: 78,
    text: '剧院的灯光亮起，所有目光都追随着她。但在谢幕的时候，她先看向了你坐着的那个位置，像小时候第一次跳舞时那样。' },
  { id: 'scholar', title: '皇家学者', subtitle: '书页翻过的地方，世界便更大一点', icon: 'book', requires: { intellect: 320, kindness: 100 }, priority: 70,
    text: '她成为学院里最年轻的讲师。学生们说，她讲故事时眼睛会发光。她笑着说，那是因为从小就有人认真听她说话。' },
  { id: 'explorer', title: '风之旅人', subtitle: '世界很远，而家永远在这里', icon: 'compass', requires: { combat: 280, stamina: 300 }, priority: 65,
    text: '她背上行囊走向远方，去见地图上尚未命名的山海。每一封寄回家的信里，都夹着一朵来自异乡的花。' },
  { id: 'healer', title: '晨光医师', subtitle: '她的善意，成为了别人的春天', icon: 'heart', requires: { kindness: 320, intellect: 160 }, priority: 60,
    text: '小小的诊所在春天开了门，她认真照顾每一位来访的人。门旁收养的小猫伸着懒腰，阳光照着那块写着“愿你安好”的木牌。' },
  { id: 'host', title: '花园茶屋主人', subtitle: '一杯热茶，就是一个温暖的世界', icon: 'cup', requires: { charm: 190, kindness: 190 }, priority: 50,
    text: '她在庭院旁开了一间茶屋。熟客说这里的茶有家的味道，她总是笑着望向窗外——你正坐在那张熟悉的藤椅上。' },
  { id: 'gardener', title: '花语园艺师', subtitle: '认真生活的人，总能等到花开', icon: 'leaf', requires: { stamina: 220, kindness: 150 }, priority: 40,
    text: '她种出了城里最美的花园，每个季节都有新的颜色。她把第一束自己培育的蔷薇送给你，说：“谢谢你，耐心等我长大。”' },
  { id: 'home', title: '温柔的日常', subtitle: '平凡的一生，也可以闪闪发光', icon: 'home', requires: {}, priority: 0,
    text: '她没有成为传说中的人物，却长成了一个善良、独立、热爱生活的人。晚饭后你们依旧在花园里散步。那些一起度过的普通日子，就是最好的结局。' },
];

export const SHOP = [
  { id: 'notebook', name: '星纹笔记本', icon: 'book', price: 100, description: '学习类日程额外获得智力 +1。' },
  { id: 'boots', name: '轻便旅行靴', icon: 'compass', price: 120, description: '探索日程的压力消耗 -5。' },
  { id: 'ribbon', name: '蔷薇发带', icon: 'flower', price: 90, description: '学习类日程额外获得魅力 +1。' },
  { id: 'teaset', name: '白瓷茶具', icon: 'cup', price: 110, description: '休息日程额外减少压力 5。' },
];
/** 每年四份纪念收藏，随季节开放；纯收藏，不增加任何能力或收入。 */
export const KEEPSAKES = Array.from({ length: 8 }, (_, year) => [
  { season: 'spring', name: '春日压花册', icon: 'flower', month: 3, text: '把今年春天的第一朵花，轻轻夹在书页里。' },
  { season: 'summer', name: '海风贝壳盒', icon: 'compass', month: 6, text: '小小的贝壳盒里，藏着一起听过的海风。' },
  { season: 'autumn', name: '秋日纪念章', icon: 'leaf', month: 9, text: '用一枚小小的纪念章，收藏这个金色的秋天。' },
  { season: 'winter', name: '冬夜星灯', icon: 'star', month: 11, text: '灯光落在窗边，今年的冬夜有了温柔的颜色。' },
].map(item => ({ id: `${year}-${item.season}`, name: `${10 + year}岁 · ${item.name}`, icon: item.icon, description: item.text, availableMonth: year * 12 + item.month, price: 300 + year * 100 })) ).flat();
/** group：衣橱分类（season 四季 / daily 日常 / special 特别）；season：当季款（与游戏月份的季节对应，集市与衣橱会标“当季”） */
export const OUTFITS = [
  { id: 'summer', name: '晴日水手裙', color: '#86aebd', description: '短袖水手领、百褶裙与系带草帽。夏日外出款。', price: 800, group: 'season', season: '夏' },
  { id: 'winter', name: '林间冬日', color: '#879b7c', description: '羊毛披肩、针织衫与格纹长裙。冬季保暖款。', price: 900, group: 'season', season: '冬' },
  { id: 'spring', name: '春日花信', color: '#e8a597', description: '粉色开襟衫配叶绿色中长裙，提着一篮刚摘的花。春日出游款。', price: 800, group: 'season', season: '春' },
  { id: 'autumn', name: '枫叶暖秋', color: '#d9a93c', description: '芥黄色长开衫配锈红百褶裙，挎着小皮包，手里是两片红枫叶。', price: 900, group: 'season', season: '秋' },
  { id: 'festival', name: '花灯舞会', color: '#c58f9b', description: '蕾丝领、泡泡袖与层叠裙摆。节庆正式礼服。', price: 1600, group: 'special' },
  { id: 'rain', name: '雨后小径', color: '#e9d98a', description: '奶黄色木扣雨衣、蓝色雨靴和一把收起的小伞。雨天也想出门。', price: 700, group: 'daily' },
  { id: 'sleep', name: '星夜安睡', color: '#b9aec6', description: '绣着小星星的睡衣，肩上搭着玫瑰色开衫。属于夜晚的软绵绵。', price: 600, group: 'daily' },
  { id: 'garden', name: '庭院来信', color: '#91a18a', description: '最初的绿裙，装着整个春天。', price: 0, group: 'daily' },
  { id: 'rose', name: '蔷薇午后', color: '#c9949e', description: '温柔的玫瑰色，为特别的日子。', price: 400, group: 'daily' },
  { id: 'sky', name: '晴空序曲', color: '#829fb7', description: '把远方的天空，穿在身上。', price: 400, group: 'daily' },
];
