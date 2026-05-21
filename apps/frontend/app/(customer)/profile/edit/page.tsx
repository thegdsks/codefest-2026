'use client';

import {
  ArrowLeft,
  CheckCircle2,
  Coffee,
  GlassWater,
  Mail,
  ShieldAlert,
  Sliders,
  Smartphone,
  Utensils,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { useCustomer } from '@/components/hotel/CustomerProvider';
import CheckboxGrid from '@/components/hotel/edit/CheckboxGrid';
import DobPicker from '@/components/hotel/edit/DobPicker';
import { LabeledInput, LabeledSelect, toOptions } from '@/components/hotel/edit/LabeledField';
import {
  ALCOHOL_OPTIONS,
  BEVERAGE_OPTIONS,
  COMMUNICATION_OPTIONS,
  COUNTRIES,
  COUNTRY_CODES,
  DIETARY_OPTIONS,
  FLOOR_OPTIONS,
  FOOD_OPTIONS,
  PILLOW_OPTIONS,
  ROOM_AMENITIES_OPTIONS,
  STATES,
} from '@/lib/hotel/edit-profile-options';
import type { UserProfile } from '@/lib/hotel/types';

const ROOM_TYPE_OPTIONS = [
  { value: 'non-smoking', label: 'Non-smoking' },
  { value: 'smoking', label: 'Smoking' },
  { value: 'no preference', label: 'No preference' },
];
const BED_TYPE_OPTIONS = [
  { value: 'king', label: 'King' },
  { value: '2 double beds', label: '2 double beds' },
  { value: '2 queen beds', label: '2 queen beds' },
  { value: 'no preference', label: 'No preference' },
];
const PRIORITY_OPTIONS = [
  { value: 'room type', label: 'Room type' },
  { value: 'bed type', label: 'Bed type' },
  { value: 'no preference', label: 'No preference' },
];

function toggle(list: string[], opt: string): string[] {
  return list.includes(opt) ? list.filter((o) => o !== opt) : [...list, opt];
}

export default function EditProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, isLoggedIn } = useCustomer();

  useEffect(() => {
    if (!isLoggedIn) router.replace('/login');
  }, [isLoggedIn, router]);

  const [country, setCountry] = useState(user.country || '');
  const [zipCode, setZipCode] = useState(user.zipCode || '');
  const [addressLine1, setAddressLine1] = useState(user.addressLine1 || '');
  const [addressLine2, setAddressLine2] = useState(user.addressLine2 || '');
  const [city, setCity] = useState(user.city || '');
  const [stateProv, setStateProv] = useState(user.stateProv || '');
  const [email, setEmail] = useState(user.email || '');
  const [confirmEmail, setConfirmEmail] = useState(user.email || '');
  const [mobileCode, setMobileCode] = useState(user.mobileCode || '+1');
  const [mobilePhone, setMobilePhone] = useState(user.mobilePhone || '');
  const [homeCode, setHomeCode] = useState(user.homeCode || '+1');
  const [homePhone, setHomePhone] = useState(user.homePhone || '');
  const [businessCode, setBusinessCode] = useState(user.businessCode || '+1');
  const [businessPhone, setBusinessPhone] = useState(user.businessPhone || '');
  const [dobMonth, setDobMonth] = useState(user.dobMonth || '');
  const [dobDay, setDobDay] = useState(user.dobDay || '');
  const [gender, setGender] = useState<'Male' | 'Female'>(user.gender || 'Female');

  const [floor, setFloor] = useState(user.preferences?.floor || '');
  const [pillow, setPillow] = useState(user.preferences?.pillow || '');
  const [turndown, setTurndown] = useState(user.preferences?.turndown || '');
  const [roomType, setRoomType] = useState<UserProfile['roomType']>(user.roomType || '');
  const [bedType, setBedType] = useState<UserProfile['bedType']>(user.bedType || '');
  const [importantOption, setImportantOption] = useState<UserProfile['importantOption']>(
    user.importantOption || ''
  );

  const [allergies, setAllergies] = useState<string[]>(user.preferences?.allergies || []);
  const [breakfast, setBreakfast] = useState(user.preferences?.breakfast || '');
  const [foodPreferences, setFoodPreferences] = useState<string[]>(user.foodPreferences || []);
  const [beveragePreferences, setBeveragePreferences] = useState<string[]>(
    user.beveragePreferences || []
  );
  const [alcoholPreferences, setAlcoholPreferences] = useState<string[]>(
    user.alcoholPreferences || []
  );
  const [roomAmenities, setRoomAmenities] = useState<string[]>(user.roomAmenities || []);
  const [communicationPreferences, setCommunicationPreferences] = useState<string[]>(
    user.communicationPreferences || ['Postal Mail']
  );

  const [isSuccessToastVisible, setIsSuccessToastVisible] = useState(false);
  const [emailError, setEmailError] = useState('');

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    setEmailError('');

    if (email.toLowerCase().trim() !== confirmEmail.toLowerCase().trim()) {
      setEmailError('Confirm Email must match Email');
      return;
    }

    updateProfile({
      email: email.toLowerCase().trim(),
      country,
      zipCode,
      addressLine1,
      addressLine2,
      city,
      stateProv,
      mobileCode,
      mobilePhone,
      homeCode,
      homePhone,
      businessCode,
      businessPhone,
      dobMonth,
      dobDay,
      gender,
      roomType,
      bedType,
      importantOption,
      foodPreferences,
      beveragePreferences,
      alcoholPreferences,
      roomAmenities,
      communicationPreferences,
      preferences: {
        floor: floor.trim(),
        pillow: pillow.trim(),
        turndown: turndown.trim(),
        allergies,
        breakfast: breakfast.trim(),
      },
    });

    setIsSuccessToastVisible(true);
    setTimeout(() => {
      setIsSuccessToastVisible(false);
      router.push('/profile');
    }, 1600);
  };

  return (
    <div className="bg-[#fbf9f8] min-h-screen pb-24 font-sans text-black relative">
      {isSuccessToastVisible && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 bg-black text-[#ffdea5] px-6 py-4 flex items-center gap-3 animate-bounce shadow-xl">
          <CheckCircle2 className="text-[#ffdea5]" size={18} />
          <span className="font-sans text-xs uppercase tracking-widest font-bold">
            Sanctuary Registry Successfully Updated
          </span>
        </div>
      )}

      <main className="max-w-[720px] mx-auto px-6 py-12">
        <button
          type="button"
          onClick={() => router.push('/profile')}
          className="flex items-center gap-2 text-[#775a19] hover:text-black hover:underline text-xs font-sans font-bold uppercase tracking-widest mb-10 transition-colors bg-transparent border-none cursor-pointer"
        >
          <ArrowLeft size={14} />
          Back to Sanctuary Dashboard
        </button>

        <header className="mb-8 text-left">
          <h1 className="font-serif text-3xl font-bold text-black mb-1 select-none">{user.name}</h1>
          <p className="text-sm font-sans text-gray-500">
            To change your first or last name, contact our Registry Sanctuary concierge with formal
            documentation.
          </p>
        </header>

        <hr className="border-gray-200 mb-8" />

        <form onSubmit={handleFormSubmit} className="space-y-6 text-left">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <LabeledSelect
              id="countryRegion"
              label="Country/Region"
              value={country}
              onChange={setCountry}
              options={toOptions(COUNTRIES)}
              placeholder="Select Country/Region"
            />
            <LabeledInput
              id="zipCode"
              label="Zip/Postal Code"
              value={zipCode}
              onChange={setZipCode}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <LabeledInput
              id="addressLine1"
              label="Address Line 1"
              value={addressLine1}
              onChange={setAddressLine1}
              required
            />
            <LabeledInput
              id="addressLine2"
              label="Address Line 2"
              value={addressLine2}
              onChange={setAddressLine2}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <LabeledInput id="city" label="City" value={city} onChange={setCity} required />
            <LabeledSelect
              id="stateProvince"
              label="State/Province"
              value={stateProv}
              onChange={setStateProv}
              options={toOptions(STATES)}
              placeholder="Select State/Province"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <LabeledInput
              id="email"
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              required
            />
            <LabeledInput
              id="confirmEmail"
              label="Re-enter Email"
              type="email"
              value={confirmEmail}
              onChange={setConfirmEmail}
              required
              error={emailError || undefined}
              errorIcon={<ShieldAlert size={14} />}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-5 items-end">
            <LabeledSelect
              id="mobileCode"
              label="Country Code"
              value={mobileCode}
              onChange={setMobileCode}
              options={toOptions(COUNTRY_CODES)}
            />
            <LabeledInput
              id="mobilePhone"
              label="Mobile Phone Number"
              type="tel"
              value={mobilePhone}
              onChange={setMobilePhone}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-5 items-end">
            <LabeledSelect
              id="homeCode"
              label="Country Code"
              value={homeCode}
              onChange={setHomeCode}
              options={toOptions(COUNTRY_CODES)}
            />
            <LabeledInput
              id="homePhone"
              label="Home Phone Number"
              type="tel"
              value={homePhone}
              onChange={setHomePhone}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-5 items-end">
            <LabeledSelect
              id="businessCode"
              label="Country Code"
              value={businessCode}
              onChange={setBusinessCode}
              options={toOptions(COUNTRY_CODES)}
            />
            <LabeledInput
              id="businessPhone"
              label="Business Phone Number"
              type="tel"
              value={businessPhone}
              onChange={setBusinessPhone}
            />
          </div>

          <DobPicker
            month={dobMonth}
            day={dobDay}
            onChange={(m, d) => {
              setDobMonth(m);
              setDobDay(d);
            }}
          />

          <div className="pt-4 text-left">
            <h3 className="font-sans font-bold text-sm text-black mb-4 select-none">Gender</h3>
            <div className="flex gap-8 items-center">
              {(['Male', 'Female'] as const).map((g) => (
                <label key={g} className="flex items-center gap-3 cursor-pointer group select-none">
                  <input
                    type="radio"
                    name="gender"
                    value={g}
                    checked={gender === g}
                    onChange={() => setGender(g)}
                    className="sr-only"
                  />
                  <span
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                      gender === g ? 'border-black' : 'border-gray-300 group-hover:border-black'
                    }`}
                  >
                    {gender === g && <span className="w-2.5 h-2.5 rounded-full bg-black block" />}
                  </span>
                  <span className="font-sans text-sm text-gray-800 font-medium">{g}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Accommodation Choices */}
          <div className="pt-8 border-t border-gray-250/30 text-left space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <Sliders size={18} className="text-[#775a19]" />
              <h3 className="font-serif text-xl font-bold text-black select-none">
                Accommodation Choices
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LabeledSelect
                id="estateFloor"
                label="Estate Floor Preference / Floor Choice"
                value={floor}
                onChange={setFloor}
                options={toOptions(FLOOR_OPTIONS)}
                placeholder="Select Floor Choice"
              />
              <LabeledSelect
                id="pillowSelection"
                label="Pillow Selections"
                value={pillow}
                onChange={setPillow}
                options={toOptions(PILLOW_OPTIONS)}
                placeholder="Select Pillow Selection"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LabeledInput
                id="turndownTiming"
                label="Turndown Timing"
                value={turndown}
                onChange={setTurndown}
                placeholder="e.g. Post 8 PM"
              />
              <LabeledSelect
                id="roomType"
                label="Room Type"
                value={roomType ?? ''}
                onChange={(v) => setRoomType(v as UserProfile['roomType'])}
                options={ROOM_TYPE_OPTIONS}
                placeholder="Select Room Type"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LabeledSelect
                id="bedType"
                label="Bed Type"
                value={bedType ?? ''}
                onChange={(v) => setBedType(v as UserProfile['bedType'])}
                options={BED_TYPE_OPTIONS}
                placeholder="Select Bed Type"
              />
              <LabeledSelect
                id="importantOption"
                label="What is most important?"
                value={importantOption ?? ''}
                onChange={(v) => setImportantOption(v as UserProfile['importantOption'])}
                options={PRIORITY_OPTIONS}
                placeholder="Select Priority"
              />
            </div>

            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Sliders size={15} className="text-[#775a19]" />
                <h4 className="text-sm font-bold text-black font-sans uppercase tracking-wider">
                  Room Amenities
                </h4>
              </div>
              <p className="text-xs text-gray-500 mb-4 font-sans">
                Select any additional room amenities you would like prepared in your suite.
              </p>
              <CheckboxGrid
                options={ROOM_AMENITIES_OPTIONS}
                selected={roomAmenities}
                onToggle={(opt) => setRoomAmenities((prev) => toggle(prev, opt))}
              />
            </div>
          </div>

          {/* Dining and Dietary Preferences */}
          <div className="pt-8 border-t border-gray-250/30 text-left space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <Utensils size={18} className="text-[#775a19]" />
              <h3 className="font-serif text-xl font-bold text-black select-none">
                Dining and Dietary Preferences
              </h3>
            </div>

            <LabeledInput
              id="breakfastSched"
              label="Breakfast Scheduling"
              value={breakfast}
              onChange={setBreakfast}
              placeholder="e.g. Continental in-suite, 7:30 AM"
            />

            <div className="pt-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Sliders size={15} className="text-[#775a19]" />
                <h4 className="text-sm font-bold text-black font-sans uppercase tracking-wider">
                  Dietary
                </h4>
              </div>
              <p className="text-xs text-gray-500 mb-4 font-sans">
                Select any dietary preferences you have.
              </p>
              <CheckboxGrid
                options={DIETARY_OPTIONS}
                selected={allergies}
                onToggle={(opt) => setAllergies((prev) => toggle(prev, opt))}
                size="md"
                containerClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-3.5 gap-x-6"
              />
            </div>

            <div className="pt-4 pb-4">
              <div className="flex items-center gap-2 mb-2">
                <Utensils size={15} className="text-[#775a19]" />
                <h4 className="text-sm font-bold text-black font-sans uppercase tracking-wider">
                  Food
                </h4>
              </div>
              <p className="text-xs text-gray-500 mb-4 font-sans">
                Select your favorite types of foods and cuisines.
              </p>
              <CheckboxGrid
                options={FOOD_OPTIONS}
                selected={foodPreferences}
                onToggle={(opt) => setFoodPreferences((prev) => toggle(prev, opt))}
              />
            </div>

            <div className="pt-4 pb-4 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <Coffee size={15} className="text-[#775a19]" />
                <h4 className="text-sm font-bold text-black font-sans uppercase tracking-wider">
                  Beverages
                </h4>
              </div>
              <p className="text-xs text-gray-500 mb-4 font-sans">
                Select your preferred non-alcoholic beverages.
              </p>
              <CheckboxGrid
                options={BEVERAGE_OPTIONS}
                selected={beveragePreferences}
                onToggle={(opt) => setBeveragePreferences((prev) => toggle(prev, opt))}
              />
            </div>

            <div className="pt-4 pb-2 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-2">
                <GlassWater size={15} className="text-[#775a19]" />
                <h4 className="text-sm font-bold text-black font-sans uppercase tracking-wider">
                  Beer, Wine &amp; Spirits
                </h4>
              </div>
              <p className="text-xs text-gray-500 mb-4 font-sans">
                Select your alcoholic beverages of choice.
              </p>
              <CheckboxGrid
                options={ALCOHOL_OPTIONS}
                selected={alcoholPreferences}
                onToggle={(opt) => setAlcoholPreferences((prev) => toggle(prev, opt))}
              />
            </div>
          </div>

          {/* Communications */}
          <div className="pt-8 border-t border-gray-250/30 text-left space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <Mail size={18} className="text-[#775a19]" />
              <h3 className="font-serif text-xl font-bold text-black select-none">
                Communications
              </h3>
            </div>

            <div className="space-y-5">
              <p className="font-sans text-[13px] text-gray-700 leading-relaxed max-w-3xl">
                Use my personal data to send me personalized promotional offers on Signal Force and
                Advertising Partners' Platforms, based on my activity and information from third
                parties.
              </p>

              <CheckboxGrid
                options={COMMUNICATION_OPTIONS}
                selected={communicationPreferences}
                onToggle={(opt) => setCommunicationPreferences((prev) => toggle(prev, opt))}
                size="md"
                containerClassName="flex flex-col gap-4 pt-2"
              />
            </div>
          </div>

          <div className="mt-8 p-4 bg-[#fbf9f8] border border-gray-200 rounded-[8px] flex items-center gap-3.5">
            <Smartphone className="text-[#e5a03b] shrink-0" size={18} />
            <p className="font-sans text-[11px] text-gray-600 tracking-wide leading-relaxed">
              Get the app for the easiest way to book trips and track points.
            </p>
          </div>

          <hr className="border-gray-200 my-8" />

          <div className="flex justify-end items-center gap-8 pt-4">
            <button
              type="button"
              onClick={() => router.push('/profile')}
              className="font-sans text-xs font-bold text-gray-500 hover:text-black uppercase tracking-widest cursor-pointer underline hover:no-underline transition-all border-none bg-transparent p-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="bg-[#e5e5e5] hover:bg-black text-[#5a5a5a] hover:text-white font-sans font-bold text-xs uppercase tracking-[0.2em] px-8 py-3.5 rounded-full transition-all duration-300 cursor-pointer shadow-sm hover:shadow-md active:scale-95"
            >
              Submit
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
