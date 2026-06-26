import * as router from '@tanstack/react-router';
console.log('ClientOnly exists in @tanstack/react-router:', 'ClientOnly' in router);
console.log('Keys of @tanstack/react-router:', Object.keys(router).filter(k => k.toLowerCase().includes('client')));
