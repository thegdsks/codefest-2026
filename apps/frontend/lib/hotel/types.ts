export interface Destination {
  id: string;
  name: string;
  location: string;
  image: string;
  rating: number;
  reviewsCount: number;
  price: number;
  neighborhood: string;
  amenities: string[];
  description: string;
  featured?: boolean;
}

export interface PastStay {
  destination: string;
  date: string;
  amount: string;
  status: 'Completed' | 'Upcoming';
  receiptId: string;
}

export interface Partner {
  id: string;
  name: string;
  ratio: string;
  icon: string;
}

export interface UserProfile {
  name: string;
  email: string;
  memberNumber: number;
  status: 'Gold' | 'Platinum' | 'Diamond';
  points?: number;
  nextTierPoints: number;
  preferences: {
    floor: string;
    pillow: string;
    turndown: string;
    allergies: string[];
    breakfast: string;
  };
  country?: string;
  zipCode?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateProv?: string;
  mobileCode?: string;
  mobilePhone?: string;
  homeCode?: string;
  homePhone?: string;
  businessCode?: string;
  businessPhone?: string;
  dobMonth?: string;
  dobDay?: string;
  gender?: 'Male' | 'Female';

  roomType?: 'non-smoking' | 'smoking' | 'no preference' | '';
  bedType?: 'king' | '2 double beds' | '2 queen beds' | 'no preference' | '';
  importantOption?: 'room type' | 'bed type' | 'no preference' | '';
  roomAmenities?: string[];

  foodPreferences?: string[];
  beveragePreferences?: string[];
  alcoholPreferences?: string[];

  communicationPreferences?: string[];
}

export interface TransferDetails {
  id: string;
  partner: string;
  amount: number;
  date: string;
}
