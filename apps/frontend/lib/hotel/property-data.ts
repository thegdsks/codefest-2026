export interface PropertyAmenity {
  key: string;
  title: string;
  desc: string;
}

export interface PropertySuite {
  name: string;
  price: number;
}

export interface PropertyConfig {
  name: string;
  location: string;
  image: string;
  description: string;
  secondary_description: string;
  rating: number;
  reviewsCount: number;
  price: number;
  amenities: PropertyAmenity[];
  suites: PropertySuite[];
}

export const PROPERTY_CONFIGS: Record<string, PropertyConfig> = {
  paris: {
    name: 'Hôtel Thomas de Paris',
    location: 'PARIS, FRANCE',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBRsNik1rv2zS5SL-Cz-DoV6Fb2F9wvZS5avSOXzWndht-QHX1eEvxQSbWMO0piydTrb41pT9sjBLOIV636khJtgUemobTD5T0yc8s49R4yoYHGrPicuqGRi7O0GnEEJXLa3pKnx_noGoCFFdJUy0oniz0oVTa8DI1c6T76gSQdvGF9XEK-Gjx8jmUNmYYMFAfXsm0-6Un0Yxx6S8vsUPlaYw30fmY79jY6jCPfLXBa_-tGTu-PtLf6BOilc7WCe6zmVP3qpOqh_so',
    description:
      'Since 1922, Hôtel Thomas de Paris has served as the quintessential retreat for sovereign families, creative visionaries, and those who seek the perfect intersection of French history and contemporary refinement. Situated mere steps from the tree-lined Champs-Élysées, our neoclassical chateau offers a grand sanctuary of quiet isolation amidst the high energy of the French capital.',
    secondary_description:
      'Every material detail, from the hand-carved Romanesque limestone to the custom-curated scent of our cedarwood lobby, has been meticulously calibrated to evoke a feeling of timeless, permanent beauty. We invite you to experience hospitality not merely as a high-end service, but as an enduring visual art form.',
    rating: 4.9,
    reviewsCount: 842,
    price: 1250,
    amenities: [
      {
        key: 'SPA',
        title: "L'Institut Spa",
        desc: 'Custom facial, sound therapy, and holistic thermal water alignments directed by world-recognized restorative experts.',
      },
      {
        key: 'MIC',
        title: "Le Table D'Ambre",
        desc: 'An exquisite three michelin-star culinary choreography led by Chef Julianne Mercer, championing organic local ingredients.',
      },
      {
        key: 'POOL',
        title: 'Rooftop Sky Pool',
        desc: 'Unobstructed, panoramic views of the spectacular Eiffel Tower from our heated basalt infinity sky-pool.',
      },
      {
        key: 'FIT',
        title: 'State Gym Suite',
        desc: 'Equipped with modern Technogym biomechanical platforms and dedicated Olympic personal trainers.',
      },
    ],
    suites: [
      { name: 'Deluxe Prestige Suite', price: 1250 },
      { name: 'Eiffel Vista Suite', price: 1855 },
      { name: 'Royal Opera Penthouse', price: 2400 },
      { name: 'Signal Force Sovereign Chamber', price: 3100 },
    ],
  },
  'bastide-gordes': {
    name: 'Le Domaine de Kumar-Sharma',
    location: 'PROVENCE, FRANCE',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC1n1ooFnTYyXMGyqcIysZc_SFsShQcHpvB5xoGY8AjhkvJtirrNwSQ302XaY85Xo8tYyjDRObAR7xsrFhtA6ykYFCbYvHUynQnwKQuQJq2cW4ImHl9_zWDTRd15UWqxt_EgZL505d0YsSP87dfAam_0YTWPvPWydlb7_9hGiKiBs9dOb6Wr5tQOrv9oFkIaOCgQSHTzgQYGJx4B_VBwcYJeXZTkzBsHx_DaiXR0o2mlpuUjhqRNMgHpCG5Q3d-SygQBe9ubd4zSh8',
    description:
      "Experience the grandeur of an 18th-century chateau perched on the cliffs of one of France's most beautiful villages. Featuring a world-class Sisley Spa and panoramic views of the valley.",
    secondary_description:
      'Perched within ancient castle walls, each terrace, dining lounge, and stone walkway has been designed to optimize the majestic golden light of Provence. Let the sweet aroma of lavender and centuries-old stone transport you to a place of pure French aristocratic luxury.',
    rating: 4.9,
    reviewsCount: 124,
    price: 840,
    amenities: [
      {
        key: 'SPA',
        title: 'Sisley Spa Center',
        desc: 'Specialty plant-based phytocosmetology care, aromatic steam caverns, and deep therapeutic water rituals.',
      },
      {
        key: 'MIC',
        title: 'Clover Gordes',
        desc: 'A vibrant culinary choreography by world-renowned French chefs, capturing wild Provencal herbs and seasonal harvests.',
      },
      {
        key: 'POOL',
        title: 'Cliffside Infinity Pool',
        desc: 'Swim at the edge of the world. A beautiful heated pool floating above cypress valleys and historic cliff edges.',
      },
      {
        key: 'EST',
        title: 'Archival Library & Lounge',
        desc: 'A collection of 18th-century manuscripts, leather-bound books, and regional reserve wines for historical leisure.',
      },
    ],
    suites: [
      { name: 'Classic Provencal Suite', price: 840 },
      { name: 'Valley Horizon View Suite', price: 1150 },
      { name: 'Lord Luberon Chamber', price: 1650 },
      { name: 'Grand Ducal Bastide Suite', price: 2200 },
    ],
  },
  'villa-gallici': {
    name: 'The Tate Manor',
    location: 'PROVENCE, FRANCE',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDP_IX8oSrhJv1TdXnP3eNUTX0-opIcf5u5bSLVpSx7R7hUjvzKjOEXBoQAcYFMJMVmoZHiPbWc8scKrYqQlJOuydv8L3s2TEpqaDFQLiv_iLZGqHMRiOofT3YFkQ7-Timc32RL-BnxSkBC3XlGS-zBYsugNHS_anRd3uNOkY6HPaLBTGmuAOCNySRPD4big7YzQcJoKYp0FpRXh96qVoeoOEKLOOB3AiKwAa-eouXVHYfl5XkgpFjhDll-MqpXANKaOtk3d-yPJcE',
    description:
      'A secret garden retreat just steps from the historic center. Italian-influenced architecture meets Provencal charm in this 18th-century residence surrounded by centuries-old plane trees.',
    secondary_description:
      'Discover a private park filled with lavender, rose bushes, and elegant Florentine details. The interiors boast classic silk fabrics and period-accurate antiques creating a museum-level accommodation signature.',
    rating: 4.8,
    reviewsCount: 89,
    price: 620,
    amenities: [
      {
        key: 'SPA',
        title: 'Villa Wellness Pavilion',
        desc: 'Outdoor massage treatment rooms nestled under hundred-year-old pines and essential oil diffusions.',
      },
      {
        key: 'MIC',
        title: 'Le Relais de la Villa',
        desc: 'A Michelin-starred gourmet stage highlighting light, sun-baked Provencal and Mediterranean flavors.',
      },
      {
        key: 'POOL',
        title: 'Romanesque Garden Pool',
        desc: 'A neoclassical heated pool surrounded by tall cypress pillars, draped lounge beds, and private butler service.',
      },
      {
        key: 'FIT',
        title: 'Private Fitness Chalet',
        desc: 'Cardio and resistance training equipment in an elegant pine wood pavilion overlooking the gardens.',
      },
    ],
    suites: [
      { name: 'Provencal Deluxe Room', price: 620 },
      { name: 'Italian-Influence Salon Suite', price: 920 },
      { name: 'Centuries-Old Plane Tree Suite', price: 1400 },
    ],
  },
  'chateau-saint-martin': {
    name: 'Palais de Gagan Singh',
    location: 'PROVENCE, FRANCE',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuA-mTBGx5QMDLJxTdGxyK60hcwyRro_mbTNjuveLej8zZvveo6xkkhMhLKi6AQkoW8zRJT5lTogC2YVwL4pwWJMry4uAD-YTvL9z6XvzMuk-9_p-Guv7Hm-n5F1PsZEhq9_n7_xiEn_uVZRbQ_4hW2nVrvleNUVFNvax8MiKq1_SiSAQIfWbrDdmjzCtGeKNcy1LuVYGwOGcAJyuAnAdq0h2-6l7yV38aQIKG19PhgJLyR0c-qbRWeZRW5QQgVPXcQzb4H8HppKIyE',
    description:
      'Perched on the hills above Vence, this palace offers breathtaking views of the Mediterranean. It combines a Michelin-starred restaurant with a 300-year-old history of hospitality.',
    secondary_description:
      'Initially established as a Knights Templar stronghold in 1150, the estate bridges legendary ancient heritage with unmatched contemporary architectural care. Admire custom French tapestries and panoramic coastal sights.',
    rating: 5.0,
    reviewsCount: 42,
    price: 1150,
    amenities: [
      {
        key: 'SPA',
        title: "Spa L'Occitane",
        desc: 'Restorative face treatments and deep organic clay pairings inside our cool sandstone vault arches.',
      },
      {
        key: 'MIC',
        title: 'Le Saint-Martin',
        desc: 'One Michelin star culinary mastery showcasing coastal harvests, local black truffles, and citrus notes.',
      },
      {
        key: 'POOL',
        title: 'La Piscine Pool',
        desc: 'A beautiful basalt-tiled swimming basin framed by olive vineyards, white-washed stones, and clear blue water.',
      },
      {
        key: 'FIT',
        title: 'Olive Grove Gym',
        desc: 'Cardio decks and outdoor yoga decks nestled securely within our historic terraced fruit groves.',
      },
    ],
    suites: [
      { name: 'Templar Classic Room', price: 1150 },
      { name: 'Sovereign View Terrace Suite', price: 1680 },
      { name: 'Imperial Castle Duplex', price: 2350 },
    ],
  },
};

export function getPropertyConfig(id: string): PropertyConfig {
  return PROPERTY_CONFIGS[id] ?? PROPERTY_CONFIGS.paris;
}
