import React from 'react';
import { Combobox } from './Combobox.jsx';

const COUNTRIES = ['United Arab Emirates', 'Egypt', 'Ethiopia', 'Kenya', 'Colombia', 'Brazil', 'Rwanda', 'Uganda', 'Honduras', 'Indonesia', 'Yemen', 'Peru'];

export function CountryField({ countries = COUNTRIES, value, onChange, placeholder = 'Select a country', ...rest }) {
  return <Combobox options={countries.map((c) => ({ value: c, label: c }))} value={value} onChange={onChange} placeholder={placeholder} emptyText="No country matches" {...rest} />;
}
