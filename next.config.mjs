import os from 'os';

// Dynamically gather all local network IPs so cross-origin HMR works automatically on any network
const getLocalDevOrigins = () => {
  const interfaces = os.networkInterfaces();
  const origins = ['localhost', '127.0.0.1'];
  
  for (const interfaceName of Object.keys(interfaces)) {
    for (const iface of interfaces[interfaceName]) {
      // Filter for IPv4 and external addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        origins.push(iface.address);
        origins.push(`${iface.address}:3000`); // Include port just in case
      }
    }
  }
  
  return origins;
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: getLocalDevOrigins()
};

export default nextConfig;
