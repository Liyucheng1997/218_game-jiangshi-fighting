// =====================================================================
//  剧情 · 茅山伏魔录
//  民国十三年，湘西。茅山弟子真理守义庄，师父玄清子赴落霞村查案未归。
//  黑符养尸、纸扎还魂、无常被拘、鬼门洞开——幕后是三十年前被逐出山门的师叔玄阴子。
//  全部文本集中于此，方便修改。
// =====================================================================

export const CAST = {
  zhenli: { name: '真理', title: '茅山弟子', color: '#ffd890', voice: 'zhenli', portrait: 'priest' },
  master: { name: '玄清子', title: '茅山掌教 · 师父', color: '#a8d0ff', voice: 'master', portrait: 'master' },
  villain: { name: '玄阴子', title: '逆天邪道', color: '#d8a0ff', voice: 'villain', portrait: 'sorcerer' },
  wuWhite: { name: '白无常', title: '谢必安', color: '#e8eef8', voice: 'wuWhite', portrait: 'wuWhite' },
  wuBlack: { name: '黑无常', title: '范无救', color: '#a0a8c0', voice: 'wuBlack', portrait: 'wuBlack' },
  axiu: { name: '阿秀', title: '落霞村遗孤', color: '#ffb0b8', voice: 'villager', portrait: 'villager' },
  narrator: { name: '', title: '', color: '#d8c8a8', voice: 'narrator', portrait: null },
};

// 剧情段落：{ who, text, cam?, fx? }；cam / fx 由主程序解释（镜头机位、音效、特效）
export const SCENES = {
  prologue: [
    { who: 'narrator', text: '民国十三年，七月初九。湘西，酉水河畔。' },
    { who: 'narrator', text: '河湾有座义庄，专停客死异乡、等着赶尸匠领回原籍的"客人"。' },
    { who: 'master', text: '真理，为师要去趟落霞村。那边捎信来，说村里接连死人，死状蹊跷。' },
    { who: 'zhenli', text: '师父，弟子随您同去？' },
    { who: 'master', text: '不必。庄里七口棺材，都是赶尸匠寄放的客人——你守好他们，莫让人气冲了尸。' },
    { who: 'master', text: '驳壳枪留给你。记住：符要贴正，墨斗线要弹直，人要站稳。' },
    { who: 'master', text: '若有变故，烧这道传音符，为师自会知晓。' },
    { who: 'narrator', text: '三日后，七月十二，子时。', fx: 'gong' },
    { who: 'narrator', text: '棺材板响了。' },
  ],

  // ---------------------------------------------------------------- 第一章 · 义庄
  ch1Intro: [
    { who: 'zhenli', text: '……棺材板在响。', cam: 'coffins' },
    { who: 'zhenli', text: '不止一口。', cam: 'yard' },
    { who: 'zhenli', text: '祖师爷在上，茅山弟子真理——今夜守庄！', cam: 'hero', fx: 'gong' },
  ],
  ch1Boss: [
    { who: 'zhenli', text: '尸身赤红，所过之处寸草焦枯……是旱魃！' },
  ],
  ch1Clear: [
    { who: 'zhenli', text: '（从旱魃焦黑的尸灰里，拈起一角未燃尽的符纸）这是……' },
    { who: 'zhenli', text: '茅山的笔法，却是倒书敕令，以黑狗血混尸油写成——禁术"养尸符"！' },
    { who: 'zhenli', text: '有人故意在义庄养尸。这些"客人"，是被人送来的。' },
    { who: 'master', text: '（传音符中，声音断断续续）黑符？！……真理，你即刻动身来落霞村，为师……' },
    { who: 'zhenli', text: '师父？师父！', fx: 'burnout' },
    { who: 'narrator', text: '传音符化作一缕青烟。天边，落霞村的方向，阴云压得很低。' },
  ],

  // ---------------------------------------------------------------- 第二章 · 荒村
  ch2Intro: [
    { who: 'narrator', text: '落霞村。雨下了七天七夜。', cam: 'rain' },
    { who: 'zhenli', text: '整村的人……都不见了。只剩满屋纸扎，齐刷刷望着门口。', cam: 'yard' },
    { who: 'axiu', text: '（井里传来细小的声音）道、道长……别进去……纸人会动……', cam: 'well' },
    { who: 'axiu', text: '那天来了个黑衣老道，他一摇铃，纸人就把爹娘他们都带走了……', cam: 'well' },
    { who: 'zhenli', text: '躲好，别出声。今夜，谁也带不走你。', cam: 'hero', fx: 'gong' },
  ],
  ch2Boss: [
    { who: 'wuWhite', text: '一见生财……阳间的道士，也敢挡阴差勾魂？' },
    { who: 'wuBlack', text: '天下太平。挡路者——一并锁了。' },
    { who: 'zhenli', text: '它们眼里有黑气……是被人拘了心神！' },
  ],
  ch2Clear: [
    { who: 'wuWhite', text: '（锁链寸寸崩断，眼中黑气散去）……多谢道长，破我兄弟身上的拘魂令。' },
    { who: 'wuBlack', text: '施令之人以茅山秘法篡改阴司文书，驱我二人替他拘魂。' },
    { who: 'zhenli', text: '茅山秘法……是谁？' },
    { who: 'wuWhite', text: '道号玄阴子。七月十五子时，他要以千魂为祭，开鬼门、起犼王。' },
    { who: 'wuBlack', text: '还有——你师父，三日前已被他拘入阴司。' },
    { who: 'zhenli', text: '……玄阴子。师父从未提过这个名字。' },
    { who: 'wuWhite', text: '鬼门就在乱葬岗下。道长，此去九死一生。' },
    { who: 'zhenli', text: '那便还有一生。' },
  ],

  // ---------------------------------------------------------------- 第三章 · 阴司
  ch3Intro: [
    { who: 'narrator', text: '七月十五，中元。血月当空。', cam: 'moon' },
    { who: 'narrator', text: '乱葬岗裂开一道深渊，阴风倒灌，地缝里渗出岩浆般的红光。', cam: 'cracks' },
    { who: 'villain', text: '（声音自四面八方传来）呵……玄清子教出来的好徒弟。', cam: 'gate' },
    { who: 'villain', text: '来得正好。犼王醒了，正饿着。', cam: 'hero', fx: 'gong' },
  ],
  ch3Boss: [
    { who: 'narrator', text: '千年古尸，褪尽腐肉，化而为犼——口喷烟火，力撼山岳。' },
    { who: 'zhenli', text: '连龙王都惧它三分……那又如何！' },
  ],
  ch3Clear: [
    { who: 'narrator', text: '犼王轰然倒地。一缕黑红的尸气自它残躯中升起，飘向鬼门。' },
    { who: 'villain', text: '好，好。犼的尸元，已尽数归我。' },
    { who: 'villain', text: '师侄，你不过替我杀了一把钥匙。' },
    { who: 'zhenli', text: '玄阴子！我师父在哪？' },
    { who: 'villain', text: '就在门后。他的魂魄，是开门的最后一道锁。' },
    { who: 'villain', text: '想救他？进来。' },
  ],

  // ---------------------------------------------------------------- 第四章 · 鬼门
  ch4Intro: [
    { who: 'narrator', text: '鬼门之后，是阴阳交界的祭坛。', cam: 'gate' },
    { who: 'narrator', text: '锁魂链自虚空垂下，那一头，系着一道熟悉的魂影。', cam: 'master' },
    { who: 'master', text: '真……理？你不该来……', cam: 'master' },
    { who: 'zhenli', text: '师父！弟子来接您回家。', cam: 'hero' },
    { who: 'villain', text: '感人。三十年了，师兄，你还是这副样子。', cam: 'villain' },
    { who: 'master', text: '世上本无长生之法。玄阴，回头吧。', cam: 'master' },
    { who: 'villain', text: '回头？我的头，早在三十年前就被你们砍了！', cam: 'villain', fx: 'gong' },
  ],
  ch4Boss: [
    { who: 'villain', text: '茅山正法，我比你师父学得更好。' },
    { who: 'villain', text: '今夜让你见识——什么叫逆天！' },
  ],

  // ---------------------------------------------------------------- 结局
  endingCommon: [
    { who: 'villain', text: '（尸化褪去，跪倒在祭坛上，露出一张苍老的脸）……师兄，我只是……不想死。' },
    { who: 'master', text: '我知道。我们都怕。' },
    { who: 'narrator', text: '玄阴子化作一捧灰，散进了阴风里。' },
    { who: 'narrator', text: '鬼门失了阵眼，开始崩塌。', fx: 'quake' },
  ],
  endingNormal: [
    { who: 'master', text: '真理，门要合上了。为师的魂魄与锁魂链缠在一处，走不了了。' },
    { who: 'zhenli', text: '不！一定还有办法——' },
    { who: 'master', text: '傻徒儿。以我一魂为封，鬼门百年不开——这笔买卖，划算。' },
    { who: 'master', text: '义庄交给你了。符要贴正，墨斗线要弹直……' },
    { who: 'master', text: '人，要站稳。', fx: 'seal' },
    { who: 'narrator', text: '天亮了。', fx: 'dawn' },
    { who: 'narrator', text: '那年中元之后，湘西再没闹过尸变。' },
    { who: 'narrator', text: '义庄里多了一块无字的牌位，和一个每晚都会给它上香的年轻道士。' },
  ],
  endingTrue: [
    { who: 'master', text: '真理，门要合上了。为师的魂魄与锁魂链缠在一处，走不了了。' },
    { who: 'zhenli', text: '师父，还有办法。七卷残卷，弟子都找齐了——是祖师留下的"七星锁魂阵"！' },
    { who: 'master', text: '你……竟真把它找全了。' },
    { who: 'zhenli', text: '以北斗七星封门，不必以魂相抵。师父，搭把手！', fx: 'stars' },
    { who: 'master', text: '好……好！为师这把老骨头，还能再骂你几年。', fx: 'seal' },
    { who: 'narrator', text: '天亮了。', fx: 'dawn' },
    { who: 'narrator', text: '那年中元之后，湘西再没闹过尸变。' },
    { who: 'narrator', text: '人们说，河湾义庄里住着一老一少两个道士——老的爱骂人，少的爱顶嘴。' },
  ],
};

// 章节引子（章节卡上的题诗）
export const EPIGRAPH = [
  '夜半棺声如叩门，\n一灯如豆守孤魂。',
  '雨打纸人胭脂冷，\n井底犹闻唤娘声。',
  '血月当空鬼门开，\n千年尸骨化犼来。',
  '一念长生一念魔，\n锁魂链上照山河。',
];

// 战斗中的台词（非阻塞字幕）
export const BARKS = {
  ch1: {
    wave1: [{ who: 'master', text: '（传音）真理？符火冲天，尸变了么？听着——僵尸凭人气寻人，按住 C 闭气，它们便嗅不着你。' }],
    wave2: [{ who: 'zhenli', text: '尸气越来越重……乱葬岗那边，有东西要出来了。' }],
    wave3: [{ who: 'master', text: '（传音）白僵畏火！火符（右键）一点即燃。' }],
  },
  ch2: {
    wave1: [{ who: 'axiu', text: '小心井边那个穿红衣的！她是……去年投井的翠姑……' }],
    wave2: [{ who: 'zhenli', text: '锁链声……黑白无常亲自来勾魂？可这些人阳寿未尽！' }],
    wave3: [{ who: 'axiu', text: '道长，纸人怕火——它们怕火！' }],
  },
  ch3: {
    wave1: [{ who: 'villain', text: '你可知，你师父为何从不提我？因为他怕。' }],
    wave2: [{ who: 'zhenli', text: '阴兵借道……虎头盾挡得住正面的枪，那就绕到侧面打！' }],
    wave3: [{ who: 'villain', text: '三十年前，茅山逐我下山。今夜，我要整座茅山跪着看我成仙。' }],
  },
  ch4: {
    wave1: [{ who: 'master', text: '真理……阴兵都是被拘的亡魂。打散它们，便是超度它们。' }],
  },
  firstElite: [{ who: 'zhenli', text: '这只身上邪气格外重——头顶写着它的门道，看清了再打。' }],
  lowHp: [{ who: 'master', text: '（传音）稳住心神！看准它出手的一瞬罡步（E）闪开。' }],
  perfect: [{ who: 'zhenli', text: '灵台清明……就是现在！' }],
  stagger: [{ who: 'zhenli', text: '破绽！' }],
  horde: [{ who: 'zhenli', text: '尸潮……从{dir}边来了！' }],
  scroll: [{ who: 'zhenli', text: '茅山残卷……是祖师的手迹。' }],
  bossHalf: {
    drought: [{ who: 'zhenli', text: '它在烧地脉——别站在发红的地上！' }],
    hou: [{ who: 'zhenli', text: '它要喷火了，离开它正面！' }],
    sorcerer1: [{ who: 'villain', text: '你以为……这就是我全部的道行？犼血入体，我便是新的尸王！' }, { who: 'master', text: '他吞了犼元——真理，莫与他硬碰，寻他破绽！' }],
    sorcerer2: [{ who: 'villain', text: '鬼门——开！阴兵过境，生人回避！' }, { who: 'master', text: '魂锁光束碰不得——随光而走，莫要停步！' }],
    partner: [{ who: 'wuBlack', text: '兄弟——！' }],
  },
  death: [{ who: 'master', text: '……真理？' }],
};

// 茅山残卷（跨局收集，集齐七卷解锁真结局）
export const SCROLLS = [
  { id: 1, title: '其一 · 养尸', from: 'drought', text: '凡尸葬于养尸之地，或聚阴之穴，百日不腐，是为"荫尸"。以倒书黑符镇其额，夜饲以生血，七七之后，尸能自起。此术伤天和、折阳寿，茅山列为第一禁术，习者逐出山门，永不复录。' },
  { id: 2, title: '其二 · 玄阴', from: 'elite', text: '玄阴，本名陆子期，十二岁入山，十五岁通《上清大洞真经》，二十岁画符可召五雷，同门无出其右。唯性急而惧死，尝问吾："师兄，人修到头，也是一抔土么？"吾不能答。' },
  { id: 3, title: '其三 · 犼', from: 'hou', text: '犼者，僵尸千年所化，尸元凝而不散。古籍载，以犼之尸元为钥，可启阴阳之门。钥在犼腹，门在中元——二者相合，阴兵可借道于人间。' },
  { id: 4, title: '其四 · 拘魂令', from: 'wuWhite', text: '阴司拘魂，凭生死簿与勾魂牌。若有人以茅山"移文法"篡改文书，再以黑狗血封令，则无常亦受其驱使，拘阳寿未尽之人，此谓"拘魂令"。破之之法：断其锁链，散其黑气。' },
  { id: 5, title: '其五 · 鬼门', from: 'elite', text: '七月十五，地官赦罪，鬼门开一夜。寻常时，门开而魂归，鸡鸣即闭；若有人以活魂为锁、强撑门户，则门不能闭，阴阳倒悬，百鬼昼行。' },
  { id: 6, title: '其六 · 师兄弟', from: 'elite', text: '（一封未寄出的信）子期师弟：当年逐你下山，是师门的规矩，却是我的过错。你怕死，我何尝不怕？只是怕了，便更要站稳。山门之外风大，你多添件衣裳。——师兄 清' },
  { id: 7, title: '其七 · 七星锁魂阵', from: 'elite', text: '北斗七星，主死；南斗六星，主生。欲闭强开之鬼门，以七星之位布阵，引天罡之气为锁，可代魂魄封门。阵成之时，需持阵者心无挂碍——救人者，先救己心。' },
];

export const TIPS = [
  '僵尸凭人气寻人——按住 C 闭气，可令其暂失踪迹。',
  '白僵畏火，毛僵刀枪不入：对症下药，事半功倍。',
  '阴兵的虎头盾挡得住正面枪弹，绕到侧背或用道法破之。',
  '在敌人出手的一瞬罡步（E）闪避，可入"灵台清明"——万物迟滞。',
  '首领的"破绽"满时会跪地喘息，此时伤害大增。',
  '连斩越高，阳气越盛；被击中则连斩中断。',
  '精英怪的词缀写在头顶：「爆裂」者死后尸爆，速退！',
  '地上发光的纹样是出手的预兆：纹样填满之时，便是落下之刻。',
  '集齐七卷茅山残卷，或许能改写某人的命运。',
  '桃木剑近身斩击可破纸人与厉鬼；驳壳枪爆头伤害最高。',
  '「符护」精英身周的符纸挡得住枪弹，火符与道法可破。',
  '尸潮来袭前会有鼓声与方位提示，提前占据有利地形。',
];

// 片尾字幕
export const CREDITS = [
  ['真理斗僵尸 · 茅山伏魔录', ''],
  ['制　作', 'Yucheng LI'],
  ['程序化建模 · 动画', '全部角色、枪械、场景均由代码实时生成'],
  ['音乐 · 音效', '程序合成：古琴、琵琶、二胡、箫、堂鼓、锣钹、人声'],
  ['引擎', 'Three.js · Web Audio'],
  ['致敬', '那些年的香港僵尸电影'],
  ['', '符要贴正，墨斗线要弹直，人要站稳。'],
];
