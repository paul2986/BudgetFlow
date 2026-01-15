
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const CURRENCIES: Currency[] = [
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'MXN', symbol: '$', name: 'Mexican Peso' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'PLN', symbol: 'zł', name: 'Polish Zloty' },
  { code: 'CZK', symbol: 'Kč', name: 'Czech Koruna' },
  { code: 'HUF', symbol: 'Ft', name: 'Hungarian Forint' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal' },
  { code: 'QAR', symbol: '﷼', name: 'Qatari Riyal' },
  { code: 'KWD', symbol: 'د.ك', name: 'Kuwaiti Dinar' },
  { code: 'BHD', symbol: '.د.ب', name: 'Bahraini Dinar' },
  { code: 'OMR', symbol: '﷼', name: 'Omani Rial' },
  { code: 'JOD', symbol: 'د.ا', name: 'Jordanian Dinar' },
  { code: 'LBP', symbol: '£', name: 'Lebanese Pound' },
  { code: 'EGP', symbol: '£', name: 'Egyptian Pound' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  { code: 'RON', symbol: 'lei', name: 'Romanian Leu' },
  { code: 'BGN', symbol: 'лв', name: 'Bulgarian Lev' },
  { code: 'HRK', symbol: 'kn', name: 'Croatian Kuna' },
  { code: 'RSD', symbol: 'дин', name: 'Serbian Dinar' },
  { code: 'UAH', symbol: '₴', name: 'Ukrainian Hryvnia' },
  { code: 'BYN', symbol: 'Br', name: 'Belarusian Ruble' },
  { code: 'KZT', symbol: '₸', name: 'Kazakhstani Tenge' },
  { code: 'UZS', symbol: 'лв', name: 'Uzbekistani Som' },
  { code: 'GEL', symbol: '₾', name: 'Georgian Lari' },
  { code: 'AMD', symbol: '֏', name: 'Armenian Dram' },
  { code: 'AZN', symbol: '₼', name: 'Azerbaijani Manat' },
  { code: 'MDL', symbol: 'L', name: 'Moldovan Leu' },
  { code: 'ALL', symbol: 'L', name: 'Albanian Lek' },
  { code: 'MKD', symbol: 'ден', name: 'Macedonian Denar' },
  { code: 'BAM', symbol: 'KM', name: 'Bosnia-Herzegovina Convertible Mark' },
  { code: 'ISK', symbol: 'kr', name: 'Icelandic Krona' },
  { code: 'LTL', symbol: 'Lt', name: 'Lithuanian Litas' },
  { code: 'LVL', symbol: 'Ls', name: 'Latvian Lats' },
  { code: 'EEK', symbol: 'kr', name: 'Estonian Kroon' },
  { code: 'CLP', symbol: '$', name: 'Chilean Peso' },
  { code: 'ARS', symbol: '$', name: 'Argentine Peso' },
  { code: 'UYU', symbol: '$U', name: 'Uruguayan Peso' },
  { code: 'PYG', symbol: 'Gs', name: 'Paraguayan Guarani' },
  { code: 'BOB', symbol: '$b', name: 'Bolivian Boliviano' },
  { code: 'PEN', symbol: 'S/.', name: 'Peruvian Sol' },
  { code: 'COP', symbol: '$', name: 'Colombian Peso' },
  { code: 'VES', symbol: 'Bs', name: 'Venezuelan Bolívar' },
  { code: 'GYD', symbol: '$', name: 'Guyanese Dollar' },
  { code: 'SRD', symbol: '$', name: 'Surinamese Dollar' },
  { code: 'FKP', symbol: '£', name: 'Falkland Islands Pound' },
  { code: 'GIP', symbol: '£', name: 'Gibraltar Pound' },
  { code: 'SHP', symbol: '£', name: 'Saint Helena Pound' },
  { code: 'JEP', symbol: '£', name: 'Jersey Pound' },
  { code: 'GGP', symbol: '£', name: 'Guernsey Pound' },
  { code: 'IMP', symbol: '£', name: 'Isle of Man Pound' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'GHS', symbol: '¢', name: 'Ghanaian Cedi' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr' },
  { code: 'RWF', symbol: 'RWF', name: 'Rwandan Franc' },
  { code: 'BIF', symbol: 'FBu', name: 'Burundian Franc' },
  { code: 'DJF', symbol: 'Fdj', name: 'Djiboutian Franc' },
  { code: 'SOS', symbol: 'S', name: 'Somali Shilling' },
  { code: 'ERN', symbol: 'Nfk', name: 'Eritrean Nakfa' },
  { code: 'SDG', symbol: 'ج.س.', name: 'Sudanese Pound' },
  { code: 'SSD', symbol: '£', name: 'South Sudanese Pound' },
  { code: 'CDF', symbol: 'FC', name: 'Congolese Franc' },
  { code: 'AOA', symbol: 'Kz', name: 'Angolan Kwanza' },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha' },
  { code: 'MWK', symbol: 'MK', name: 'Malawian Kwacha' },
  { code: 'MZN', symbol: 'MT', name: 'Mozambican Metical' },
  { code: 'MGA', symbol: 'Ar', name: 'Malagasy Ariary' },
  { code: 'MUR', symbol: '₨', name: 'Mauritian Rupee' },
  { code: 'SCR', symbol: '₨', name: 'Seychellois Rupee' },
  { code: 'CVE', symbol: '$', name: 'Cape Verdean Escudo' },
  { code: 'SLL', symbol: 'Le', name: 'Sierra Leonean Leone' },
  { code: 'LRD', symbol: '$', name: 'Liberian Dollar' },
  { code: 'GNF', symbol: 'FG', name: 'Guinean Franc' },
  { code: 'GMD', symbol: 'D', name: 'Gambian Dalasi' },
  { code: 'SEN', symbol: 'F', name: 'Senegalese Franc' },
  { code: 'MLI', symbol: 'F', name: 'Malian Franc' },
  { code: 'BFA', symbol: 'F', name: 'Burkinabé Franc' },
  { code: 'NER', symbol: 'F', name: 'Niger Franc' },
  { code: 'CIV', symbol: 'F', name: 'Ivorian Franc' },
  { code: 'TGO', symbol: 'F', name: 'Togolese Franc' },
  { code: 'BEN', symbol: 'F', name: 'Beninese Franc' },
  { code: 'XOF', symbol: 'F', name: 'West African CFA Franc' },
  { code: 'XAF', symbol: 'F', name: 'Central African CFA Franc' },
  { code: 'KMF', symbol: 'CF', name: 'Comorian Franc' },
  { code: 'XPF', symbol: '₣', name: 'CFP Franc' },
  { code: 'TOP', symbol: 'T$', name: 'Tongan Paʻanga' },
  { code: 'WST', symbol: 'WS$', name: 'Samoan Tala' },
  { code: 'VUV', symbol: 'VT', name: 'Vanuatu Vatu' },
  { code: 'SBD', symbol: '$', name: 'Solomon Islands Dollar' },
  { code: 'FJD', symbol: '$', name: 'Fijian Dollar' },
  { code: 'PGK', symbol: 'K', name: 'Papua New Guinean Kina' },
  { code: 'NCL', symbol: '₣', name: 'New Caledonian Franc' },
  { code: 'TVD', symbol: '$', name: 'Tuvaluan Dollar' },
  { code: 'KIR', symbol: '$', name: 'Kiribati Dollar' },
  { code: 'NRU', symbol: '$', name: 'Nauruan Dollar' },
  { code: 'PLW', symbol: '$', name: 'Palauan Dollar' },
  { code: 'MHL', symbol: '$', name: 'Marshallese Dollar' },
  { code: 'FSM', symbol: '$', name: 'Micronesian Dollar' },
];

const CURRENCY_STORAGE_KEY = 'app_currency';

// Global currency state to ensure all components stay in sync
// Default to British Pound (GBP) which is now first in the list
let globalCurrency: Currency = CURRENCIES[0];
let globalCurrencyListeners: Set<(currency: Currency) => void> = new Set();

const notifyListeners = (currency: Currency) => {
  console.log('useCurrency: Notifying', globalCurrencyListeners.size, 'listeners of currency change:', currency);
  globalCurrencyListeners.forEach(listener => {
    try {
      listener(currency);
    } catch (error) {
      console.error('useCurrency: Error notifying listener:', error);
    }
  });
};

export const useCurrency = () => {
  const [currency, setCurrencyState] = useState<Currency>(globalCurrency);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrency();
  }, []);

  useEffect(() => {
    // Subscribe to global currency changes
    const listener = (newCurrency: Currency) => {
      console.log('useCurrency: Received currency update:', newCurrency);
      setCurrencyState(newCurrency);
    };
    
    globalCurrencyListeners.add(listener);
    
    // Cleanup listener on unmount
    return () => {
      globalCurrencyListeners.delete(listener);
    };
  }, []);

  const loadCurrency = async () => {
    try {
      console.log('useCurrency: Loading currency from storage...');
      const savedCurrency = await AsyncStorage.getItem(CURRENCY_STORAGE_KEY);
      if (savedCurrency) {
        const parsedCurrency = JSON.parse(savedCurrency);
        const foundCurrency = CURRENCIES.find(c => c.code === parsedCurrency.code);
        if (foundCurrency) {
          console.log('useCurrency: Loaded currency:', foundCurrency);
          globalCurrency = foundCurrency;
          setCurrencyState(foundCurrency);
          // Don't notify listeners here as this is initial load
        }
      } else {
        console.log('useCurrency: No saved currency found, using default GBP');
        globalCurrency = CURRENCIES[0]; // GBP is now first in the list
        setCurrencyState(CURRENCIES[0]);
      }
    } catch (error) {
      console.error('useCurrency: Error loading currency:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveCurrency = useCallback(async (newCurrency: Currency) => {
    try {
      console.log('useCurrency: Saving currency:', newCurrency);
      await AsyncStorage.setItem(CURRENCY_STORAGE_KEY, JSON.stringify(newCurrency));
      
      // Update global state and notify all listeners
      globalCurrency = newCurrency;
      setCurrencyState(newCurrency);
      notifyListeners(newCurrency);
      
      console.log('useCurrency: Currency saved and broadcasted successfully');
    } catch (error) {
      console.error('useCurrency: Error saving currency:', error);
    }
  }, []);

  const formatCurrency = useCallback((amount: number) => {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch (error) {
      console.error('useCurrency: Error formatting currency:', error);
      // Fallback to simple formatting
      return `${currency.symbol}${amount.toFixed(2)}`;
    }
  }, [currency]);

  return {
    currency,
    setCurrency: saveCurrency,
    formatCurrency,
    loading,
    availableCurrencies: CURRENCIES,
  };
};
