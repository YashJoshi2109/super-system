const resources = {
  en: {
    requestTitle: 'Request Shuttle',
    name: 'Full Name',
    phone: 'Phone',
    country: 'Country',
    phone_hint: '10-digit number',
    terminal: 'Terminal',
    voucher: 'Enter Voucher Code (5 chars)',
    gate: 'Gate',
    courtesy: 'At Courtesy Pickup Vans?',
    submit: 'Request Ride',
    locate: 'Share Live Location'
  },
  es: {
    requestTitle: 'Solicitar Transporte',
    name: 'Nombre Completo',
    phone: 'Teléfono',
    country: 'País',
    phone_hint: 'Número de 10 dígitos',
    terminal: 'Terminal',
    voucher: 'Cupón (5 caracteres)',
    gate: 'Puerta',
    courtesy: '¿En zona de Vans de cortesía?',
    submit: 'Pedir Viaje',
    locate: 'Compartir ubicación en vivo'
  }
};

export function t(lang, key) {
  return resources[lang]?.[key] || resources.en[key] || key;
}
