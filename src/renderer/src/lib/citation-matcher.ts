/**
 * 法规引用匹配器
 * 演示阶段：本地关键词匹配
 * 后期替换为：调用 Qdrant public_regulations collection 向量检索
 */
import type { Citation } from '../../../shared/types';

interface LawEntry {
  lawName: string;
  article: string;
  text: string;
  keywords: string[];
  effectiveStatus: 'active' | 'historical';
  version?: string;
}

// ===== 本地法规库（演示用，覆盖外商投资/合规/数据/劳动等核心场景）=====
const LAW_DB: LawEntry[] = [
  // ── 公司法 ──
  {
    lawName: '中华人民共和国公司法（2023修订）',
    article: '第一百八十四条',
    text: '公司合并，应当由合并各方签订合并协议，并编制资产负债表及财产清单。公司应当自作出合并决议之日起十日内通知债权人，并于三十日内在报纸上公告。债权人自接到通知书之日起三十日内，未接到通知书的自公告之日起四十五日内，可以要求公司清偿债务或者提供相应的担保。',
    keywords: ['合并', '吸收合并', '公司合并', '合并协议', '债权人通知', '资产负债表'],
    effectiveStatus: 'active',
    version: '2023-12-29',
  },
  {
    lawName: '中华人民共和国公司法（2023修订）',
    article: '第八十四条',
    text: '股份有限公司的发起人，应当签订发起人协议，明确各自在公司设立过程中的权利和义务。发起人为二人以上的，应当签订发起人协议。',
    keywords: ['股权结构', '发起人', '股东', '股份', '持股比例'],
    effectiveStatus: 'active',
    version: '2023-12-29',
  },
  {
    lawName: '中华人民共和国公司法（2023修订）',
    article: '第一百八十条',
    text: '董事、监事、高级管理人员对公司负有忠实义务和勤勉义务。董事、监事、高级管理人员不得利用职权收受贿赂或者其他非法收入，不得侵占公司的财产。',
    keywords: ['董事', '监事', '高管', '公司治理', '忠实义务', '勤勉义务'],
    effectiveStatus: 'active',
    version: '2023-12-29',
  },

  // ── 外商投资法 ──
  {
    lawName: '中华人民共和国外商投资法',
    article: '第二十条',
    text: '外商投资企业的组织形式、组织机构及其活动准则，适用《中华人民共和国公司法》、《中华人民共和国合伙企业法》等法律的规定。',
    keywords: ['外商投资', '外资企业', '外商投资企业', '合资', '独资', '外资'],
    effectiveStatus: 'active',
    version: '2019-03-15',
  },
  {
    lawName: '中华人民共和国外商投资法',
    article: '第四条',
    text: '国家对外商投资实行准入前国民待遇加负面清单管理制度。前款所称准入前国民待遇，是指在投资准入阶段给予外国投资者及其投资不低于本国投资者及其投资的待遇；所称负面清单，是指国家规定在特定领域对外商投资实施的准入特别管理措施。',
    keywords: ['外商投资', '负面清单', '准入', '国民待遇', '外资准入'],
    effectiveStatus: 'active',
    version: '2019-03-15',
  },

  // ── 企业所得税法 ──
  {
    lawName: '中华人民共和国企业所得税法（2018修订）',
    article: '第二十五条',
    text: '国家对重点扶持和鼓励发展的产业和项目，给予企业所得税优惠。',
    keywords: ['企业所得税', '税务', '所得税', '税收优惠', '税率', '纳税'],
    effectiveStatus: 'active',
    version: '2018-12-29',
  },
  {
    lawName: '企业重组业务企业所得税管理办法',
    article: '第二十一条',
    text: '同一控制下吸收合并适用特殊性税务处理的，需提供被合并方资产、负债的账面价值和计税基础相关资料，合并后企业需按原账面历史成本作为计税基础计提折旧、摊销。',
    keywords: ['吸收合并', '特殊性税务处理', '一般性税务处理', '税务处理', '合并税务', '递延所得税'],
    effectiveStatus: 'active',
    version: '2015-05-11',
  },
  {
    lawName: '关于继续实施企业改制重组有关契税政策的公告',
    article: '财政部 税务总局公告2023年第49号',
    text: '两个或两个以上的公司依照法律规定、合同约定合并为一个公司，且原投资主体存续的，对合并后公司承受原合并各方土地、房屋权属，免征契税。',
    keywords: ['契税', '合并契税', '土地', '房屋', '不动产', '免征契税'],
    effectiveStatus: 'active',
    version: '2023-09-01',
  },

  // ── 劳动合同法 ──
  {
    lawName: '中华人民共和国劳动合同法（2012修订）',
    article: '第三十三条',
    text: '用人单位变更名称、法定代表人、主要负责人或者投资人等事项，不影响劳动合同的履行。',
    keywords: ['劳动合同', '员工', '劳动关系', '用人单位变更', '合并劳动', '员工安置'],
    effectiveStatus: 'active',
    version: '2012-12-28',
  },
  {
    lawName: '中华人民共和国劳动合同法（2012修订）',
    article: '第三十四条',
    text: '用人单位发生合并或者分立等情况，原劳动合同继续有效，劳动合同由承继其权利和义务的用人单位继续履行。',
    keywords: ['合并劳动合同', '劳动合同继续', '员工转移', '劳动关系转移', '合并员工'],
    effectiveStatus: 'active',
    version: '2012-12-28',
  },

  // ── 数据安全法 ──
  {
    lawName: '中华人民共和国数据安全法',
    article: '第二十七条',
    text: '开展数据处理活动应当依照法律、法规的规定，建立健全全流程数据安全管理制度，组织开展数据安全教育培训，采取相应的技术措施和其他必要措施，保障数据安全。',
    keywords: ['数据安全', '数据处理', '数据管理', '数据合规', '数据保护'],
    effectiveStatus: 'active',
    version: '2021-09-01',
  },

  // ── 个人信息保护法 ──
  {
    lawName: '中华人民共和国个人信息保护法',
    article: '第十三条',
    text: '符合下列情形之一的，个人信息处理者方可处理个人信息：（一）取得个人的同意；（二）为订立、履行个人作为一方当事人的合同所必需，或者按照依法制定的劳动规章制度和依法签订的集体合同实施人力资源管理所必需；（三）为履行法定职责或者法定义务所必需……',
    keywords: ['个人信息', '个人信息保护', '数据隐私', '员工信息', '个人数据'],
    effectiveStatus: 'active',
    version: '2021-11-01',
  },

  // ── 反不正当竞争法 ──
  {
    lawName: '中华人民共和国反不正当竞争法（2019修订）',
    article: '第九条',
    text: '经营者不得实施下列侵犯商业秘密的行为：（一）以盗窃、贿赂、欺诈、胁迫、电子侵入或者其他不正当手段获取权利人的商业秘密；（二）披露、使用或者允许他人使用以前项手段获取的权利人的商业秘密……',
    keywords: ['商业秘密', '保密', '竞业禁止', '知识产权', '商业秘密保护', '秘密信息'],
    effectiveStatus: 'active',
    version: '2019-04-23',
  },

  // ── 特种设备 ──
  {
    lawName: '特种设备使用管理规则（TSG 08-2017）',
    article: '第十二条',
    text: '使用单位变更时，应当办理使用登记变更手续。设备使用单位变更需注销原登记后重新申请，且需重新检验，检验需设备在线运行。',
    keywords: ['特种设备', '压力容器', '压力管道', '电梯', '叉车', '特种设备登记'],
    effectiveStatus: 'active',
    version: '2017-08-01',
  },

  // ── AEO ──
  {
    lawName: '海关认证企业管理办法',
    article: '第十条',
    text: 'AEO认证与法人主体绑定，企业主体注销后认证资格自动失效，存续方需重新申请认证。重新认证周期通常为6-12个月，需通过海关严格审核。',
    keywords: ['AEO', 'AEO认证', '海关认证', '高级认证', '通关便利', '海关'],
    effectiveStatus: 'active',
    version: '2021-01-01',
  },

  // ── 不动产 ──
  {
    lawName: '关于继续实施企业改制重组有关土地增值税政策的公告',
    article: '财政部 税务总局公告2023年第51号',
    text: '按照法律规定或者合同约定，两个或两个以上企业合并为一个企业，且原企业投资主体存续的，对原企业将房地产转移、变更到合并后的企业，暂不征收土地增值税。',
    keywords: ['土地增值税', '不动产', '土地', '房产', '房屋', '土地使用权'],
    effectiveStatus: 'active',
    version: '2023-09-01',
  },

  // ── 合同法 ──
  {
    lawName: '中华人民共和国民法典',
    article: '第六十七条',
    text: '法人合并的，其权利和义务由合并后的法人享有和承担。法人分立的，其权利和义务由分立后的法人享有连带债权，承担连带债务，但是债权人和债务人另有约定的除外。',
    keywords: ['合并权利义务', '法人合并', '权利义务承继', '合同承继', '债权债务'],
    effectiveStatus: 'active',
    version: '2021-01-01',
  },
  {
    lawName: '中华人民共和国民法典',
    article: '第七十九条',
    text: '债权人可以将债权的全部或者部分转让给第三人，但是有下列情形之一的除外：（一）根据债权性质不得转让；（二）按照当事人约定不得转让；（三）依照法律规定不得转让。',
    keywords: ['合同转让', '权利转让', '许可合同', '知识产权许可', '转让限制'],
    effectiveStatus: 'active',
    version: '2021-01-01',
  },
];

/**
 * 根据 AI 回答内容匹配相关法规引用
 * 演示阶段：关键词匹配，最多返回 3 条最相关的
 * 后期替换为：Qdrant 向量检索 public_regulations collection
 */
export function matchCitations(content: string): Citation[] {
  if (!content || content.length < 20) return [];

  const citations: Citation[] = [];
  const seen = new Set<string>();

  // Strategy 1: parse structured [引用] markers from AI output
  const refPattern = /\[引用\]\s*《([^》]+)》(第[^\uff1a:]+[条款项])[\uff1a:]\s*([^\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = refPattern.exec(content)) !== null) {
    const key = `${m[1]}-${m[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      citations.push({ lawName: m[1], article: m[2], text: m[3].trim(), source: 'regulation' });
    }
  }

  // Strategy 2: keyword matching fallback
  if (citations.length < 3) {
    const text = content.toLowerCase();
    const scored: Array<{ entry: LawEntry; score: number }> = [];
    for (const entry of LAW_DB) {
      const key = `${entry.lawName}-${entry.article}`;
      if (seen.has(key)) continue;
      let score = 0;
      for (const kw of entry.keywords) {
        if (text.includes(kw.toLowerCase())) {
          score += kw.length >= 4 ? 3 : kw.length >= 2 ? 2 : 1;
        }
      }
      if (score > 0) scored.push({ entry, score });
    }
    scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3 - citations.length)
      .forEach(({ entry }) => {
        citations.push({ lawName: entry.lawName, article: entry.article, text: entry.text, source: 'regulation' });
      });
  }

  return citations.slice(0, 4);
}