import type { Destination, Partner, PastStay, UserProfile } from './types';

export const DESTINATIONS: Destination[] = [
  {
    id: 'bastide-gordes',
    name: 'Le Domaine de Kumar-Sharma',
    location: 'Provence, France',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC1n1ooFnTYyXMGyqcIysZc_SFsShQcHpvB5xoGY8AjhkvJtirrNwSQ302XaY85Xo8tYyjDRObAR7xsrFhtA6ykYFCbYvHUynQnwKQuQJq2cW4ImHl9_zWDTRd15UWqxt_EgZL505d0YsSP87dfAam_0YTWPvPWydlb7_9hGiKiBs9dOb6Wr5tQOrv9oFkIaOCgQSHTzgQYGJx4B_VBwcYJeXZTkzBsHx_DaiXR0o2mlpuUjhqRNMgHpCG5Q3d-SygQBe9ubd4zSh8',
    rating: 4.9,
    reviewsCount: 124,
    price: 840,
    neighborhood: 'Luberon Valley',
    amenities: ['Private Pool', 'Sisley Spa', 'Michelin Dining'],
    description:
      "Experience the grandeur of an 18th-century chateau perched on the cliffs of one of France's most beautiful villages. Featuring a world-class Sisley Spa and panoramic views of the valley.",
    featured: true,
  },
  {
    id: 'villa-gallici',
    name: 'The Tate Manor',
    location: 'Provence, France',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDP_IX8oSrhJv1TdXnP3eNUTX0-opIcf5u5bSLVpSx7R7hUjvzKjOEXBoQAcYFMJMVmoZHiPbWc8scKrYqQlJOuydv8L3s2TEpqaDFQLiv_iLZGqHMRiOofT3YFkQ7-Timc32RL-BnxSkBC3XlGS-zBYsugNHS_anRd3uNOkY6HPaLBTGmuAOCNySRPD4big7YzQcJoKYp0FpRXh96qVoeoOEKLOOB3AiKwAa-eouXVHYfl5XkgpFjhDll-MqpXANKaOtk3d-yPJcE',
    rating: 4.8,
    reviewsCount: 89,
    price: 620,
    neighborhood: 'Aix-en-Provence',
    amenities: ['Italian-influence architecture', 'Private Garden', 'Michelin Dining'],
    description:
      'A secret garden retreat just steps from the historic center. Italian-influenced architecture meets Provencal charm in this 18th-century residence surrounded by centuries-old plane trees.',
    featured: false,
  },
  {
    id: 'chateau-saint-martin',
    name: 'Palais de Gagan Singh',
    location: 'Provence, France',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuA-mTBGx5QMDLJxTdGxyK60hcwyRro_mbTNjuveLej8zZvveo6xkkhMhLKi6AQkoW8zRJT5lTogC2YVwL4pwWJMry4uAD-YTvL9z6XvzMuk-9_p-Guv7Hm-n5F1PsZEhq9_n7_xiEn_uVZRbQ_4hW2nVrvleNUVFNvax8MiKq1_SiSAQIfWbrDdmjzCtGeKNcy1LuVYGwOGcAJyuAnAdq0h2-6l7yV38aQIKG19PhgJLyR0c-qbRWeZRW5QQgVPXcQzb4H8HppKIyE',
    rating: 5.0,
    reviewsCount: 42,
    price: 1150,
    neighborhood: 'Saint-Rémy',
    amenities: ['Michelin Dining', 'Private Car Service', 'Basalt Pool'],
    description:
      'Perched on the hills above Vence, this palace offers breathtaking views of the Mediterranean. It combines a Michelin-starred restaurant with a 300-year-old history of hospitality.',
    featured: false,
  },
];

export const PARTNERS: Partner[] = [
  { id: 'aeroglobal', name: 'AeroGlobal', ratio: '3:1 Ratio', icon: 'flight_takeoff' },
  { id: 'skyhigh', name: 'SkyHigh Rewards', ratio: '3:1 Ratio', icon: 'cloud' },
  { id: 'elite', name: 'Elite Voyages', ratio: '3:1 Ratio', icon: 'sailing' },
];

export const MOCK_USER: UserProfile = {
  name: 'Julian Vane',
  email: 'j.vane@vaneenterprises.com',
  memberNumber: 624762862,
  status: 'Gold',
  points: 128450,
  nextTierPoints: 8000,
  preferences: {
    floor: 'High Floor',
    pillow: 'Foam Pillows',
    turndown: 'Post 8 PM',
    allergies: ['Gluten Free', 'No Shellfish'],
    breakfast: 'Continental in-suite, 7:30 AM',
  },
  country: 'USA',
  zipCode: '10024',
  addressLine1: '23 West 82nd Street',
  addressLine2: '',
  city: 'New York',
  stateProv: 'New York',
  mobileCode: '+1',
  mobilePhone: '',
  homeCode: '+1',
  homePhone: '2125550128',
  businessCode: '+1',
  businessPhone: '',
  dobMonth: '10',
  dobDay: '16',
  gender: 'Male',
  communicationPreferences: ['Postal Mail'],
};

export const PAST_STAYS: PastStay[] = [
  {
    destination: 'The Bongale Archival Mansion, St. Moritz',
    date: 'Feb 2024',
    amount: '$8,420.00',
    status: 'Completed',
    receiptId: 'LH-ST8420-W',
  },
  {
    destination: 'The Tate Manor, London',
    date: 'Oct 2023',
    amount: '$3,150.00',
    status: 'Completed',
    receiptId: 'LH-LD3150-Z',
  },
  {
    destination: 'Le Domaine de Kumar-Sharma, Amalfi Coast',
    date: 'Aug 2023',
    amount: '$12,900.00',
    status: 'Completed',
    receiptId: 'LH-AM1290-X',
  },
];
