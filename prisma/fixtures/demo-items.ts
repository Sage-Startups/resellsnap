/**
 * Demo fixtures.
 *
 * Four fictional, generic, non-branded items. These power both the public
 * no-login `/demo` (read-only, in-browser only) and the seeded "North & Found
 * Resale" sample workspace. Nothing here is a real product, a real brand, or a
 * real sale — every surface that shows it is labelled "Sample data".
 */
import { PlatformKey } from '@/generated/prisma/enums';

export interface DemoVariantFixture {
  platform: PlatformKey;
  title: string;
  description: string;
  fields: Record<string, string | string[]>;
}

export interface DemoItemFixture {
  id: string;
  mockupId: string;
  sku: string;
  name: string;
  categoryHint: string;
  quantity: number;
  acquisitionCostCents: number;
  facts: Array<{ key: string; value: string; confirmed: boolean; source: 'SELLER_CONFIRMED' | 'AI_INFERENCE' | 'NEEDS_CONFIRMATION'; confidence?: 'LOW' | 'MEDIUM' | 'HIGH'; evidence?: string }>;
  analysis: {
    itemType: string;
    conditionSummary: string;
    photoWarnings: Array<{ photoIndex: number; kind: string; message: string }>;
    suggestedQuestions: string[];
    searchKeywords: string[];
  };
  master: {
    title: string;
    description: string;
    conditionSummary: string;
    defectDisclosure: string;
    includedItems: string;
    measurements: string;
    attributes: Record<string, string>;
    searchTerms: string[];
  };
  variants: DemoVariantFixture[];
  prices: {
    quickSaleCents: number;
    balancedCents: number;
    maximiseReturnCents: number;
    explanation: string;
  };
}

export const DEMO_ITEMS: DemoItemFixture[] = [
  {
    id: 'trainers',
    mockupId: 'trainers',
    sku: 'RS-DEM-001',
    name: 'Cream leather trainers',
    categoryHint: 'shoes',
    quantity: 1,
    acquisitionCostCents: 900,
    facts: [
      { key: 'condition', value: 'very_good', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'size', value: 'UK 8 / US 9', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'colour', value: 'cream', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'defects', value: 'Light scuffing on the right toe; slight sole discolouration', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'material', value: 'leather upper', confirmed: false, source: 'AI_INFERENCE', confidence: 'MEDIUM', evidence: 'Grain and sheen consistent with leather, photo 1' },
      { key: 'style', value: 'low-top court trainer', confirmed: false, source: 'AI_INFERENCE', confidence: 'HIGH', evidence: 'Silhouette visible across all photos' },
    ],
    analysis: {
      itemType: 'low-top leather trainers',
      conditionSummary:
        'Used with light cosmetic wear. Scuffing visible on one toe and mild sole discolouration consistent with normal wear.',
      photoWarnings: [
        { photoIndex: 2, kind: 'MISSING_ANGLE', message: 'A photo of the insole or size label would help buyers confirm the size.' },
      ],
      suggestedQuestions: [
        'Can you confirm the brand from the tongue label or insole?',
        'Are the original laces included?',
      ],
      searchKeywords: ['leather trainers', 'cream sneakers', 'low top', 'preloved shoes'],
    },
    master: {
      title: 'Cream leather low-top trainers — UK 8 / US 9, very good condition',
      description:
        'Cream leather low-top trainers in very good used condition.\n\nWorn a handful of times. There is light scuffing on the right toe and mild discolouration on the sole, both shown in the photographs. The uppers are clean and the shape is intact.\n\nSize UK 8 / US 9. Sold as seen from a smoke-free home. Please check the photographs and ask anything before buying.',
      conditionSummary: 'Very good used condition with light cosmetic wear.',
      defectDisclosure: 'Light scuffing on the right toe. Mild sole discolouration. Both are visible in the photographs.',
      includedItems: 'Trainers only. No original box.',
      measurements: 'Insole length 27 cm.',
      attributes: { Size: 'UK 8 / US 9', Colour: 'Cream', 'Shoe style': 'Low top', Condition: 'Used — very good' },
      searchTerms: ['leather trainers', 'cream sneakers uk 8', 'low top trainers', 'preloved shoes'],
    },
    variants: [
      {
        platform: PlatformKey.EBAY,
        title: 'Cream Leather Low-Top Trainers UK 8 US 9 Very Good Condition',
        description:
          'Cream leather low-top trainers in very good used condition.\n\nCONDITION\nWorn a handful of times. Light scuffing on the right toe and mild sole discolouration, both pictured. Uppers are clean, shape intact.\n\nSIZE\nUK 8 / US 9. Insole length 27 cm.\n\nINCLUDED\nTrainers only, no original box.\n\nSold as seen from a smoke-free home.',
        fields: {
          categorySuggestion: "Clothing, Shoes & Accessories > Men's Shoes > Athletic Shoes",
          conditionDescriptor: 'USED_VERY_GOOD',
          itemSpecifics: ['Colour: Cream', 'Size: UK 8', 'Style: Low top', 'Upper material: Leather'],
        },
      },
      {
        platform: PlatformKey.VINTED,
        title: 'Cream leather low-top trainers, UK 8',
        description:
          'Cream leather trainers in very good condition. Worn only a few times.\n\nThere is light scuffing on the right toe and a little discolouration on the sole — both shown in the photos, nothing that affects wear.\n\nSize UK 8 (US 9), insole 27 cm. No box. Smoke-free home.',
        fields: { category: 'Shoes > Trainers', condition: 'Very good', colour: 'Cream' },
      },
      {
        platform: PlatformKey.DEPOP,
        title: 'cream leather low tops — UK 8',
        description:
          'Clean cream leather low-tops that go with everything. Very good condition, worn a handful of times.\n\nHonest bit: light scuff on the right toe, slight sole discolouration. Both in the pics.\n\nUK 8 / US 9. No box.',
        fields: { category: 'Shoes', hashtags: ['#preloved', '#leathertrainers', '#lowtop', '#secondhand'] },
      },
      {
        platform: PlatformKey.FACEBOOK_MARKETPLACE,
        title: 'Cream leather trainers, UK 8, very good condition',
        description:
          'Cream leather low-top trainers, UK 8 / US 9. Very good used condition — worn a few times.\n\nLight scuff on the right toe and slight sole discolouration, both in the photos.\n\nNo box. Collection preferred, can post at cost.',
        fields: { category: 'Clothing & Accessories', condition: 'Used — good', pickupNotes: 'Local pickup available; posting at cost.' },
      },
    ],
    prices: {
      quickSaleCents: 2200,
      balancedCents: 3200,
      maximiseReturnCents: 4200,
      explanation:
        'Category guideline for pre-owned footwear in very good condition. No live marketplace sales data was consulted for this sample item.',
    },
  },

  {
    id: 'jacket',
    mockupId: 'jacket',
    sku: 'RS-DEM-002',
    name: 'Vintage denim jacket',
    categoryHint: 'clothing',
    quantity: 1,
    acquisitionCostCents: 1200,
    facts: [
      { key: 'condition', value: 'good', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'size', value: 'M', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'colour', value: 'mid indigo', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'ageEra', value: '1990s', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'measurements', value: 'Chest 106 cm, length 62 cm, sleeve 61 cm', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'defects', value: 'Fading at the cuffs; one replaced button on the inner placket', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'material', value: 'cotton denim', confirmed: false, source: 'AI_INFERENCE', confidence: 'HIGH', evidence: 'Weave and seam construction visible in photo 2' },
      { key: 'question_1', value: 'Can you confirm the fabric composition from the care label?', confirmed: false, source: 'NEEDS_CONFIRMATION' },
    ],
    analysis: {
      itemType: 'denim trucker jacket',
      conditionSummary:
        'Used with honest wear. Cuff fading and one non-matching button are visible; construction and seams appear sound.',
      photoWarnings: [],
      suggestedQuestions: [
        'Can you confirm the fabric composition from the care label?',
        'Is the replaced button a close match or clearly different?',
      ],
      searchKeywords: ['denim jacket', 'vintage denim', 'trucker jacket', '90s denim'],
    },
    master: {
      title: 'Vintage 1990s indigo denim trucker jacket — size M',
      description:
        'A 1990s indigo denim trucker jacket in good used condition.\n\nThe denim has softened nicely with age. There is fading at the cuffs and one button on the inner placket has been replaced, both shown in the photographs. Seams and stitching are sound throughout.\n\nMeasured flat: chest 106 cm, length 62 cm, sleeve 61 cm. Sold as seen from a smoke-free home.',
      conditionSummary: 'Good used condition with age-appropriate wear.',
      defectDisclosure: 'Fading at both cuffs. One replaced button on the inner placket.',
      includedItems: 'Jacket only.',
      measurements: 'Chest 106 cm, length 62 cm, sleeve 61 cm (measured flat).',
      attributes: { Size: 'M', Colour: 'Mid indigo', Era: '1990s', Condition: 'Used — good' },
      searchTerms: ['vintage denim jacket', '90s trucker jacket', 'indigo denim', 'medium denim jacket'],
    },
    variants: [
      {
        platform: PlatformKey.EBAY,
        title: 'Vintage 1990s Indigo Denim Trucker Jacket Size M Good Condition',
        description:
          '1990s indigo denim trucker jacket, size M.\n\nCONDITION\nGood used condition. Fading at both cuffs and one replaced button on the inner placket, both pictured. Seams and stitching sound.\n\nMEASUREMENTS (flat)\nChest 106 cm, length 62 cm, sleeve 61 cm.\n\nSold as seen from a smoke-free home.',
        fields: {
          categorySuggestion: "Clothing, Shoes & Accessories > Men's Clothing > Coats & Jackets",
          conditionDescriptor: 'USED_GOOD',
          itemSpecifics: ['Size: M', 'Colour: Indigo', 'Style: Trucker jacket', 'Decade: 1990s'],
        },
      },
      {
        platform: PlatformKey.VINTED,
        title: '90s indigo denim trucker jacket, size M',
        description:
          'Proper 1990s denim trucker jacket, size M. The denim has softened beautifully.\n\nHonest condition: fading at the cuffs and one replaced button inside — both in the photos. Everything else is solid.\n\nFlat measurements: chest 106 cm, length 62 cm, sleeve 61 cm. Smoke-free home.',
        fields: { category: 'Jackets & coats > Denim jackets', condition: 'Good', colour: 'Blue' },
      },
      {
        platform: PlatformKey.DEPOP,
        title: '90s indigo denim trucker — M',
        description:
          'Real 90s denim trucker, broken in exactly how you want it. Mid indigo, boxy fit, size M.\n\nHonest bit: cuff fade and one replaced inner button. Pictured.\n\nChest 106 / length 62 / sleeve 61 cm.',
        fields: { category: 'Jackets', hashtags: ['#vintage', '#90s', '#denimjacket', '#truckerjacket'] },
      },
      {
        platform: PlatformKey.FACEBOOK_MARKETPLACE,
        title: 'Vintage 90s denim jacket, size M',
        description:
          '1990s indigo denim trucker jacket, size M, good used condition.\n\nCuff fading and one replaced inner button — both in the photos.\n\nChest 106 cm, length 62 cm. Collection preferred, can post.',
        fields: { category: 'Clothing & Accessories', condition: 'Used — good', pickupNotes: 'Local pickup preferred; posting available.' },
      },
    ],
    prices: {
      quickSaleCents: 2600,
      balancedCents: 3800,
      maximiseReturnCents: 5200,
      explanation:
        'Category guideline for pre-owned clothing in good condition. No live marketplace sales data was consulted for this sample item.',
    },
  },

  {
    id: 'espresso',
    mockupId: 'espresso',
    sku: 'RS-DEM-003',
    name: 'Compact espresso machine',
    categoryHint: 'home_kitchen',
    quantity: 1,
    acquisitionCostCents: 3500,
    facts: [
      { key: 'condition', value: 'good', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'functionalStatus', value: 'Fully working; descaled before listing', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'tested', value: 'yes', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'accessories', value: 'Portafilter, single and double baskets, tamper', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'defects', value: 'Light limescale marking on the drip tray; small scratch on the left side panel', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'colour', value: 'graphite', confirmed: false, source: 'AI_INFERENCE', confidence: 'HIGH', evidence: 'Consistent finish across all photos' },
    ],
    analysis: {
      itemType: 'compact domestic espresso machine',
      conditionSummary:
        'Used kitchen appliance with cosmetic marking. A scratch on one side panel and limescale traces on the drip tray are visible.',
      photoWarnings: [
        { photoIndex: 1, kind: 'MISSING_ANGLE', message: 'A photo of the machine powered on would reassure buyers it works.' },
      ],
      suggestedQuestions: [
        'Is the water tank free of cracks and leaks?',
        'Does the steam wand still produce pressure?',
      ],
      searchKeywords: ['espresso machine', 'coffee machine', 'compact espresso', 'home barista'],
    },
    master: {
      title: 'Compact espresso machine — fully working, descaled, with accessories',
      description:
        'A compact domestic espresso machine in good used condition, fully working and descaled before listing.\n\nIncluded: portafilter, single and double baskets, and a tamper.\n\nCosmetically there is a small scratch on the left side panel and light limescale marking on the drip tray, both shown in the photographs. Everything functions as it should.\n\nCollection preferred given the weight, but posting is possible.',
      conditionSummary: 'Good used condition, fully working, recently descaled.',
      defectDisclosure: 'Small scratch on the left side panel. Light limescale marking on the drip tray.',
      includedItems: 'Machine, portafilter, single basket, double basket, tamper.',
      measurements: 'Approximately 20 cm wide, 33 cm deep, 30 cm tall.',
      attributes: { Colour: 'Graphite', Condition: 'Used — good', 'Working order': 'Tested and working' },
      searchTerms: ['espresso machine', 'compact coffee machine', 'home espresso', 'barista machine'],
    },
    variants: [
      {
        platform: PlatformKey.EBAY,
        title: 'Compact Espresso Machine Fully Working Descaled With Portafilter And Tamper',
        description:
          'Compact domestic espresso machine in good used condition.\n\nWORKING ORDER\nFully working and descaled before listing. Tested.\n\nINCLUDED\nMachine, portafilter, single and double baskets, tamper.\n\nCONDITION\nSmall scratch on the left side panel; light limescale marking on the drip tray. Both pictured.\n\nApproximately 20 × 33 × 30 cm.',
        fields: {
          categorySuggestion: 'Home & Garden > Kitchen, Dining & Bar > Small Kitchen Appliances',
          conditionDescriptor: 'USED_GOOD',
          itemSpecifics: ['Colour: Graphite', 'Type: Espresso machine', 'Power source: Electric'],
        },
      },
      {
        platform: PlatformKey.VINTED,
        title: 'Compact espresso machine, working, with accessories',
        description:
          'Compact espresso machine in good working order — descaled before listing.\n\nComes with the portafilter, both baskets and a tamper.\n\nSmall scratch on the left panel and a bit of limescale marking on the drip tray, both in the photos. Works perfectly.',
        fields: { category: 'Home > Kitchen appliances', condition: 'Good', colour: 'Grey' },
      },
      {
        platform: PlatformKey.DEPOP,
        title: 'compact espresso machine — working, descaled',
        description:
          'Compact espresso machine, fully working and freshly descaled. Comes with portafilter, both baskets and tamper.\n\nHonest bit: small scratch on the left panel, light limescale on the drip tray. Pictured.\n\nHeavy — collection is easiest.',
        fields: { category: 'Home', hashtags: ['#homebarista', '#espresso', '#kitchen', '#preloved'] },
      },
      {
        platform: PlatformKey.FACEBOOK_MARKETPLACE,
        title: 'Compact espresso machine — working, with accessories',
        description:
          'Compact espresso machine, fully working and descaled. Includes portafilter, single and double baskets and a tamper.\n\nSmall scratch on the left panel, light limescale on the drip tray — both in the photos.\n\nCollection preferred (it is heavy). Can post at cost.',
        fields: { category: 'Home & Kitchen', condition: 'Used — good', pickupNotes: 'Collection preferred. Available most evenings.' },
      },
    ],
    prices: {
      quickSaleCents: 5500,
      balancedCents: 7800,
      maximiseReturnCents: 10500,
      explanation:
        'Category guideline for pre-owned homeware in good working condition. No live marketplace sales data was consulted for this sample item.',
    },
  },

  {
    id: 'camera',
    mockupId: 'camera',
    sku: 'RS-DEM-004',
    name: '35mm film camera',
    categoryHint: 'electronics',
    quantity: 1,
    acquisitionCostCents: 2000,
    facts: [
      { key: 'condition', value: 'good', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'functionalStatus', value: 'Shutter fires at all speeds; light meter untested', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'tested', value: 'yes', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'accessories', value: 'Body and 50mm lens; no strap, no case', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'defects', value: 'Brassing on the base plate; light dust visible in the viewfinder', confirmed: true, source: 'SELLER_CONFIRMED' },
      { key: 'ageEra', value: '1980s', confirmed: false, source: 'AI_INFERENCE', confidence: 'LOW', evidence: 'Body styling suggests the period; no date marking visible' },
      { key: 'question_1', value: 'Has the camera been tested with a roll of film recently?', confirmed: false, source: 'NEEDS_CONFIRMATION' },
    ],
    analysis: {
      itemType: '35mm SLR film camera',
      conditionSummary:
        'Used camera with honest cosmetic wear. Brassing at the base plate and dust in the viewfinder are visible. Internal condition cannot be assessed from photographs.',
      photoWarnings: [
        { photoIndex: 0, kind: 'MISSING_ANGLE', message: 'A photo of the film compartment and light seals would help buyers.' },
      ],
      suggestedQuestions: [
        'Has the camera been tested with a roll of film recently?',
        'Are the light seals original or replaced?',
        'Does the light meter respond with a battery fitted?',
      ],
      searchKeywords: ['35mm film camera', 'slr camera', 'film photography', 'vintage camera'],
    },
    master: {
      title: '35mm SLR film camera with 50mm lens — shutter tested, good condition',
      description:
        'A 35mm SLR film camera with a 50mm lens, in good used condition.\n\nThe shutter fires at all speeds. The light meter has not been tested — please assume it needs checking. There is brassing on the base plate and some dust visible in the viewfinder, both shown in the photographs.\n\nSupplied as body and lens only: no strap, no case, no battery.\n\nInternal condition and light seals cannot be assessed from photographs, so this is sold as seen for a buyer who is comfortable with used film equipment.',
      conditionSummary: 'Good used condition. Shutter tested; light meter untested.',
      defectDisclosure: 'Brassing on the base plate. Dust visible in the viewfinder. Light meter not tested.',
      includedItems: 'Camera body and 50mm lens only. No strap, case or battery.',
      measurements: 'Body approximately 14 cm wide.',
      attributes: { Format: '35mm', Type: 'SLR', Condition: 'Used — good', 'Shutter tested': 'Yes' },
      searchTerms: ['35mm film camera', 'slr film camera', '50mm lens', 'vintage camera'],
    },
    variants: [
      {
        platform: PlatformKey.EBAY,
        title: '35mm SLR Film Camera With 50mm Lens Shutter Tested Good Condition',
        description:
          '35mm SLR film camera with 50mm lens.\n\nWORKING ORDER\nShutter fires at all speeds. Light meter NOT tested — assume it needs checking.\n\nCONDITION\nBrassing on the base plate, dust visible in the viewfinder. Both pictured. Internal condition and light seals cannot be assessed from photographs.\n\nINCLUDED\nBody and 50mm lens only. No strap, case or battery.\n\nSold as seen.',
        fields: {
          categorySuggestion: 'Cameras & Photo > Film Photography > Film Cameras',
          conditionDescriptor: 'USED_GOOD',
          itemSpecifics: ['Film format: 35mm', 'Type: SLR', 'Included lens: 50mm'],
        },
      },
      {
        platform: PlatformKey.VINTED,
        title: '35mm SLR film camera with 50mm lens',
        description:
          '35mm SLR film camera with a 50mm lens. Shutter fires at all speeds.\n\nThe light meter has not been tested, so please assume it needs checking. There is brassing on the base plate and a little dust in the viewfinder — both in the photos.\n\nBody and lens only, no strap or case. Sold as seen.',
        fields: { category: 'Electronics > Cameras', condition: 'Good', colour: 'Black' },
      },
      {
        platform: PlatformKey.DEPOP,
        title: '35mm SLR + 50mm lens',
        description:
          'Classic 35mm SLR with a 50mm lens. Shutter fires at every speed.\n\nHonest bit: light meter untested, brassing on the base plate, dust in the viewfinder. All pictured.\n\nBody and lens only. For someone who knows film.',
        fields: { category: 'Electronics', hashtags: ['#filmcamera', '#35mm', '#analogue', '#vintage'] },
      },
      {
        platform: PlatformKey.FACEBOOK_MARKETPLACE,
        title: '35mm SLR film camera with 50mm lens',
        description:
          '35mm SLR film camera and 50mm lens. Shutter fires at all speeds; light meter untested.\n\nBrassing on the base plate and dust in the viewfinder — both in the photos.\n\nBody and lens only. Collection or posting available. Sold as seen.',
        fields: { category: 'Electronics', condition: 'Used — good', pickupNotes: 'Collection or postage available.' },
      },
    ],
    prices: {
      quickSaleCents: 4500,
      balancedCents: 6800,
      maximiseReturnCents: 9500,
      explanation:
        'Category guideline for pre-owned electronics in tested, good condition. No live marketplace sales data was consulted for this sample item.',
    },
  },
];

/**
 * Three months of the fictional reseller's operating metrics.
 *
 * IMPORTANT: these are the sample seller's numbers, not ResellSnap AI revenue.
 * Every surface that renders them says so.
 */
export const DEMO_MONTHLY_METRICS = [
  { monthOffset: 2, label: 'Month 1', generated: 42, publishedOrExported: 28, sold: 17, grossCents: 85_000 },
  { monthOffset: 1, label: 'Month 2', generated: 67, publishedOrExported: 49, sold: 31, grossCents: 162_000 },
  { monthOffset: 0, label: 'Month 3', generated: 96, publishedOrExported: 74, sold: 48, grossCents: 274_000 },
] as const;

export const DEMO_WORKSPACE_NAME = 'North & Found Resale';
