'use client';

import { Award, Calendar, MapPin, Users } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';

export default function HomeScreen() {
  const router = useRouter();

  const goResults = (query: string) => {
    router.push(`/results?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="bg-[#fbf9f8] min-h-screen font-sans">
      {/* Hero Section */}
      <section className="relative h-[921px] min-h-[700px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <button
            type="button"
            onClick={() => router.push('/property/paris')}
            className="relative block w-full h-full p-0 border-none outline-none focus:ring-0 focus:outline-none cursor-pointer"
          >
            <Image
              fill
              className="object-cover brightness-95"
              alt="Signal Force Grand Facade at twilight"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBJMBtknD8XsKafLfW8EIHvtEb0V83N2ujk9BG5-d7S7dmfIe8xs7xgdHJ8j5NTGFtmMIj_i56mznBh8QbVgoThMdDThKVBCO2TXcHeS_uLbHYG8h-K90pGWWAmZiJ9JYw-ZMzW4GPgr6mmvGFs5bD5PSFnWxXqHt52SRckiEcYVqgo1TO3Z0qz6nKLw_wDJYHTmsSi35DLlay06fSJVw2UEuKVyorYIFuYQ1eT6rp6TwB6HER7jbIW0Q9yfPZV6IHPdD3utuOeVrE"
              sizes="100vw"
            />
          </button>
          <div className="absolute inset-0 hero-gradient" />
        </div>

        <div className="relative z-10 text-center text-white p-8 max-w-4xl mx-auto flex flex-col items-center">
          <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.35em] mb-4 text-white/95 drop-shadow-sm">
            Est. 1922
          </span>
          <h1 className="font-serif text-4xl md:text-6xl font-light tracking-wide mb-8 drop-shadow-md">
            The Art of Timeless Living
          </h1>

          {/* Search Bar Container */}
          <div className="bg-white/95 backdrop-blur-md p-2 md:p-3 silk-shadow flex flex-col md:flex-row gap-2 mt-8 max-w-4xl w-full text-black">
            <button
              type="button"
              onClick={() => router.push('/search')}
              className="flex-1 flex flex-col items-start px-6 py-2 border-r border-gray-200/50 cursor-pointer hover:bg-gray-100/50 transition-colors text-left bg-transparent border-y-0 border-l-0"
            >
              <span className="text-[9px] uppercase font-bold tracking-widest text-gray-400 mb-1 flex items-center gap-1">
                <MapPin size={10} className="text-[#775a19]" />
                Destination
              </span>
              <span className="text-sm font-medium text-gray-900">Where would you go?</span>
            </button>

            <button
              type="button"
              onClick={() => router.push('/search')}
              className="flex-1 flex flex-col items-start px-6 py-2 border-r border-gray-200/50 cursor-pointer hover:bg-gray-100/50 transition-colors text-left bg-transparent border-y-0 border-l-0"
            >
              <span className="text-[9px] uppercase font-bold tracking-widest text-gray-400 mb-1 flex items-center gap-1">
                <Calendar size={10} className="text-[#775a19]" />
                Dates
              </span>
              <span className="text-sm font-medium text-gray-900">Add reservation dates</span>
            </button>

            <button
              type="button"
              onClick={() => router.push('/search')}
              className="flex-1 flex flex-col items-start px-6 py-2 cursor-pointer hover:bg-gray-100/50 transition-colors text-left bg-transparent border-none"
            >
              <span className="text-[9px] uppercase font-bold tracking-widest text-gray-400 mb-1 flex items-center gap-1">
                <Users size={10} className="text-[#775a19]" />
                Guests
              </span>
              <span className="text-sm font-medium text-gray-900">2 Adults</span>
            </button>

            <button
              type="button"
              onClick={() => goResults('Provence')}
              className="bg-black hover:bg-[#775a19] text-white px-10 py-4 text-xs font-semibold uppercase tracking-widest transition-colors cursor-pointer"
            >
              Search
            </button>
          </div>
        </div>
      </section>

      {/* Featured Destinations */}
      <section className="py-24 px-8 max-w-[1440px] mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end mb-16 gap-6">
          <div className="max-w-xl">
            <span className="text-[#775a19] text-xs font-semibold uppercase tracking-widest mb-3 block">
              Curated Escapes
            </span>
            <h2 className="font-serif text-3xl md:text-5xl text-black font-semibold mb-4">
              Iconic Sanctuaries
            </h2>
            <p className="font-sans text-gray-500 text-base leading-relaxed">
              From the historic streets of Paris to the azure horizons of Provence, discover our
              handpicked sanctuaries crafted for the global connoisseur.
            </p>
          </div>
          <button
            type="button"
            onClick={() => goResults('Provence')}
            className="font-sans text-xs font-bold uppercase tracking-widest border-b-2 border-[#775a19] pb-1 hover:text-[#775a19] hover:border-black transition-colors cursor-pointer"
          >
            Explore Options
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Paris - Large Card */}
          <button
            type="button"
            onClick={() => router.push('/property/paris')}
            className="md:col-span-8 group cursor-pointer relative overflow-hidden text-left bg-transparent border-none p-0"
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-black">
              <Image
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105 group-hover:opacity-90 grayscale-[10%] group-hover:grayscale-0"
                alt="Balcony overlooking Eiffel tower"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuC7FDqu-gNPfPr9_owPru0Suy0hdmIvYEBQuOE-gMN5VEafyhIxOY7dH56Q7e4eGEfFrc-86O2_BDNCwpKGvfYa2IL_9Hn4-M-mOjfWG305biiR-e-j2SzdaU_fMAq0Inbr6UDlKz90Q2JENxLNDO4zSTQ-B9qlDGq9vWeLav3S7OfMJqnksr8AdfNLGlqAgDEdrv62WZcoEDrwQr89axzVvYZ0RYq6CEAxNdbfTU6WsARAgs5UVKuFuaQWS7Q8SPEt07XuYLROquA"
                sizes="(max-width: 768px) 100vw, 67vw"
              />
            </div>
            <div className="mt-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="bg-[#ffdea5] text-[#261900] font-sans text-[10px] font-bold px-2.5 py-1 uppercase tracking-wider">
                  Featured Opening
                </span>
                <span className="text-xs text-gray-400 font-sans uppercase tracking-widest">
                  • Paris, France
                </span>
              </div>
              <h3 className="font-serif text-2xl font-semibold mb-2 text-black group-hover:text-[#775a19] transition-colors">
                Hôtel Thomas de Paris
              </h3>
              <p className="font-sans text-gray-500 text-sm max-w-lg leading-relaxed">
                An 18th-century palais reimagined for the modern flâneur steps from the Place
                Vendôme under a golden twilight canopy.
              </p>
            </div>
          </button>

          {/* Maldives - Small Card */}
          <button
            type="button"
            onClick={() => goResults('Maldives')}
            className="md:col-span-4 group cursor-pointer text-left bg-transparent border-none p-0"
          >
            <div className="relative aspect-[4/5] overflow-hidden bg-black">
              <Image
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105 group-hover:opacity-90"
                alt="Overwater villa Maldives"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAaviLODFVOE3X5WLciPi0UhNm9hlTS8UyWeJMAikZ5ZqLl3Y__WiMmtgWFQ-0A-q3qsCx4EY05l4KKFM4k2iWoOUjITYuk7pEnDi8S7Bdnb8u5WLSKd5k4mWM3s6XV4qHTk9pQ793OtHHRZW6GMs5QCfTRg9XM6dVsfoT9mQ9SMY-soTlG9Y_bPV_CBy4aKwgMtEd0Y8R0xxMS3KY_iMgSNl15SFF3BIop2S6CJDZnZkvnHL7j4GVUj2KupccEOBjsz7MTEifucPw"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
            </div>
            <div className="mt-6">
              <span className="text-xs text-gray-400 font-sans uppercase tracking-widest mb-1 block">
                Private Sanctuary
              </span>
              <h3 className="font-serif text-2xl font-semibold mb-2 text-black group-hover:text-[#775a19] transition-colors">
                The Azure Atoll
              </h3>
              <p className="font-sans text-gray-500 text-sm leading-relaxed">
                Secluded villas floating gracefully above a bioluminescent lagoon in the North Malé
                Atoll.
              </p>
            </div>
          </button>

          {/* Kyoto - Small Card */}
          <button
            type="button"
            onClick={() => goResults('Kyoto')}
            className="md:col-span-4 group cursor-pointer md:mt-12 text-left bg-transparent border-none p-0"
          >
            <div className="relative aspect-[4/5] overflow-hidden bg-black">
              <Image
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-105 group-hover:opacity-90"
                alt="Tranquil traditional Kyoto ryokan"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDBO8ObB9ztDZjcpbUPmak5M7mFq16WUXpXYfMZe1t--6oYXWkeLKszKcx1EgIJnMOMrXMBs22GYwn0KsXcxcBd64IB8HOn4hQ_qG5Jmj5aZCsLt11klknrwa5gtFuDwIde_N45IbX6k8ojrzK0UNG4fH0B9TpCj68vJpcHdOLlD0Qb4kWBD5kBjiMA5qxiPMNubwypedamvN9NX85MLSd3HChMllqLhybQdA8OiGQD8S4VOtnXozBqAPYOwSO32Ml6pKoEBSul3I4"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
            </div>
            <div className="mt-6">
              <span className="text-xs text-gray-400 font-sans uppercase tracking-widest mb-1 block">
                Zen Sanctuary
              </span>
              <h3 className="font-serif text-2xl font-semibold mb-2 text-black group-hover:text-[#775a19] transition-colors">
                Kyoto Ryokan Reserve
              </h3>
              <p className="font-sans text-gray-500 text-sm leading-relaxed">
                A meditative escape nestled deeply within the lush, historic Higashiyama bamboo
                groves.
              </p>
            </div>
          </button>

          {/* Call to Action Loyalty Card */}
          <div className="md:col-span-8 bg-[#efeded]/60 md:mt-12 p-12 flex flex-col justify-center items-center text-center border border-gray-250/20">
            <Award className="text-[#775a19] w-12 h-12 mb-6 font-light" />
            <h3 className="font-serif text-3xl font-semibold mb-4 max-w-md text-black">
              The Signal Force Circle
            </h3>
            <p className="font-sans text-sm text-gray-500 mb-8 max-w-lg leading-relaxed">
              Become part of our global prestige membership program to unlock preferred partner
              reward conversions, curated upgrade opportunities, and 24/7 personal travel planning
              across all estates.
            </p>
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="border border-black text-black px-10 py-4 font-sans text-xs font-semibold uppercase tracking-widest hover:bg-black hover:text-white transition-all active:scale-95 cursor-pointer"
            >
              Explore Club benefits
            </button>
          </div>
        </div>
      </section>

      {/* Curated Experiences */}
      <section className="bg-white py-24 px-8">
        <div className="max-w-[1440px] mx-auto">
          <div className="text-center mb-16">
            <span className="text-[#775a19] text-xs font-semibold uppercase tracking-[0.25em] mb-3 block">
              Profound Discovery
            </span>
            <h2 className="font-serif text-3xl md:text-5xl mb-4 text-black font-semibold">
              Curated Experiences
            </h2>
            <p className="font-sans text-gray-500 text-base max-w-2xl mx-auto leading-relaxed">
              Extend your memories. Signal Force orchestrates deep wellness journeys, fine
              gastronomy, and private travels suited purely to your legacy.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Experience 1 */}
            <div className="relative group h-[500px] overflow-hidden bg-black">
              <Image
                fill
                className="object-cover opacity-80 group-hover:scale-110 group-hover:opacity-75 transition-all duration-1000"
                alt="Spa retreat ambient pools"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuD4T8IQputG2FipS0S7BS4Ukahu-nq35omD4Im23gruz2DjCPU3iHwNA9zLc5eUe68iyJx3aHebuHnteV4ThmNF6hthjkflnEIFIb1Qwb1FKSy_TOlHqCKXXhrHOCOOxUiwK8eHjBqPcjqQsYZ6wO1GhxiCGLrlGZ4J7UHq-S-QzQphVaBcNNYxR31xuvM9d4SfaN1gujJkrcnkduNxBtYCSjytKJSrF0DJZd2wWpd7BN2Hhws2dHlOrAE6TsMVOd5J-oE91bO9PFs"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8 text-white z-10 w-full">
                <span className="text-[10px] font-semibold text-[#ffdea5] tracking-widest uppercase mb-1 block">
                  Wellness
                </span>
                <h4 className="font-serif text-2xl font-light mb-2">The Soma Terme Spa</h4>
                <p className="font-sans text-white/70 text-sm mb-4 line-clamp-2">
                  Ancient steam thermal therapy and signature clinical treatments in a pure
                  basalt-stone sanctuary.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/property/paris')}
                  className="font-sans text-[11px] font-bold uppercase tracking-wider text-white hover:text-[#ffdea5] underline transition-colors cursor-pointer bg-transparent border-none p-0"
                >
                  Discover Soma
                </button>
              </div>
            </div>

            {/* Experience 2 */}
            <div className="relative group h-[500px] overflow-hidden bg-black">
              <Image
                fill
                className="object-cover opacity-80 group-hover:scale-110 group-hover:opacity-75 transition-all duration-1000"
                alt="Culinary art plated details"
                src="/hotel/epicurean-journeys.png"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8 text-white z-10 w-full">
                <span className="text-[10px] font-semibold text-[#ffdea5] tracking-widest uppercase mb-1 block">
                  Fine Gastronomy
                </span>
                <h4 className="font-serif text-2xl font-light mb-2">Epicurean Journeys</h4>
                <p className="font-sans text-white/70 text-sm mb-4 line-clamp-2">
                  Three Michelin-starred culinary artistry and vintage cellars celebrating grand
                  regional terroir.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/property/paris')}
                  className="font-sans text-[11px] font-bold uppercase tracking-wider text-white hover:text-[#ffdea5] underline transition-colors cursor-pointer bg-transparent border-none p-0"
                >
                  Reserve Table
                </button>
              </div>
            </div>

            {/* Experience 3 */}
            <div className="relative group h-[500px] overflow-hidden bg-black">
              <Image
                fill
                className="object-cover opacity-80 group-hover:scale-110 group-hover:opacity-75 transition-all duration-1000"
                alt="Luxury sea vessel yacht"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAxE7E_2kP4I_G9MXfsSSOC2B85slXGGIo_LxGwfd1uZK_J3NoNnk-SGFyrEALOei9FQhzq6nWHcvlkAy4xNhlMGAx8t2OZrsYYkqdo-s7va_kiyTxhWlMbst8eGOA8TAq-DP-XNEjmdx7VdXWCbeYlqo3pWA-HPOZ7BU6qh1lX8RRlX_fTcCFSCDnJMkatg3yTNNWl79TFIUKq8_wW31wndvbqc2BXkUPDcwnV0VDCn7aL67rVYce60tiDXFpXZ-C_qz71MvwiaF4"
                sizes="(max-width: 768px) 100vw, 33vw"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8 text-white z-10 w-full">
                <span className="text-[10px] font-semibold text-[#ffdea5] tracking-widest uppercase mb-1 block">
                  Yachting
                </span>
                <h4 className="font-serif text-2xl font-light mb-2">Private Horizons</h4>
                <p className="font-sans text-white/70 text-sm mb-4 line-clamp-2">
                  Bespoke air and luxury sea yachting charters to remote, pristine archipelago
                  shorelines.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/property/paris')}
                  className="font-sans text-[11px] font-bold uppercase tracking-wider text-white hover:text-[#ffdea5] underline transition-colors cursor-pointer bg-transparent border-none p-0"
                >
                  Rent Charter
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brand Legacy */}
      <section className="py-24 px-8 bg-[#fbf9f8]">
        <div className="max-w-[1440px] mx-auto grid grid-cols-1 md:grid-cols-2 items-center gap-16">
          <div className="relative">
            <div className="relative w-4/5 aspect-[3/4] overflow-hidden bg-gray-200">
              <Image
                fill
                className="object-cover grayscale brightness-90 animate-fade-in"
                alt="Vintage 1920 lobby photo"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBStFgip3_3Dfe1m-UhsMSq7vkuye1yHKlzmSO_N6SD7Uvma1GawsN2NBJpksCGW7de2gFAzMGk1p2P46AUgZPHnuS020wZmHeoxqJ2mk-xUZaFl-QIzK5kJfG0NIEhkrATzT8QklVxorVHe5Xd6jnnx9vXmXXcxhKaUxIBToI71iJkFlBNTsZha_j3ORWcDNP646ivEmp3LkmIrxRO_dtNtxSERFtI5fqLmV6OMt9WEbvlY4CaR5GvmJo6-_ZPeY9B299ALB9vNJ4"
                sizes="(max-width: 768px) 80vw, 40vw"
              />
            </div>
            <div className="absolute bottom-[-40px] right-0 w-2/3 aspect-square overflow-hidden silk-shadow border-[12px] border-[#fbf9f8] bg-gray-100 z-10 hidden sm:block">
              <Image
                fill
                className="object-cover"
                alt="Modern concierge key exchange"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCB5nzV0MTbzPfNalhewUPNzObgP2FCAwku4_dJdQnU7acU7Q5dB7pBK0WGvgWN6b_6AJvCmLRuD1rlZnjso-uqCVrURyrrvNjwvXIaCK6LpkU-gQ1RgIy76RkeOO3M4Y0H5V_i-md9jxWfhHd3Cyjx3V9i3aZdXj83Q7G4p18rHyJQRcDVf-Jyfzike_w05ejdPh8YLPRmoY1xVWNjRw-crAL0rU5J3anCda5Yh-npcFIEL6x4PknDS5J-hL3C7g8RXuvrIEZacBI"
                sizes="(max-width: 768px) 67vw, 33vw"
              />
            </div>
          </div>

          <div className="md:pl-12">
            <span className="font-sans text-xs font-semibold uppercase tracking-[0.3em] text-[#775a19] mb-4 block">
              Our Legacy
            </span>
            <h2 className="font-serif text-3xl md:text-5xl mb-8 text-black font-light leading-tight">
              A Century of Exemplary Hospitality
            </h2>
            <p className="font-sans text-gray-500 text-sm leading-relaxed mb-6">
              Founded on the romantic banks of Paris' Seine in 1922, Signal Force Collection was
              born of a singular vision: to create grand, architectural sanctuaries marrying local
              heritage with uncompromising personal service.
            </p>
            <p className="font-sans text-gray-500 text-sm leading-relaxed mb-10">
              Today, each property remains a testament to that timeless promise. We treat luxury not
              as an embellishment, but as a deliberate and deep art orchestrating moments of
              absolute tranquility.
            </p>

            <div className="flex gap-12 border-t border-gray-250/20 pt-8">
              <div>
                <span className="block font-serif text-4xl text-black font-semibold">12</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Countries
                </span>
              </div>
              <div>
                <span className="block font-serif text-4xl text-black font-semibold">34</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Sanctuaries
                </span>
              </div>
              <div>
                <span className="block font-serif text-4xl text-black font-semibold">104</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Legacy Years
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
