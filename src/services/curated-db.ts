/**
 * Curated Database for high-value products.
 * Extracted from product-enrichments.js.
 */
export const CURATED_DB = [
    {
        matchPatterns: ['TV SAMSUNG CRYSTAL UHD'],
        categoryId: 'tv',
        description: 'Samsung Crystal UHD — dalle Crystal 4K, processeur Crystal 4K, PurColor, HDR.',
        coreAttributes: { screen_size: null, resolution: '4K UHD', panel_type: 'Crystal LED', os: 'Tizen', smart_tv: true, hdr: ['HDR10', 'HLG'], hdmi_ports: 3, usb_ports: 1, wifi: true, bluetooth: true },
        competitorPrices: [{ source: 'Ouedkniss', price: 93000 }, { source: 'Iris Sat', price: 96000 }],
    },
    {
        matchPatterns: ['TV HISENSE SMART VIDAA'],
        categoryId: 'tv',
        description: 'Hisense VIDAA Smart TV — excellent rapport qualité/prix, VIDAA OS fluide.',
        coreAttributes: { resolution: 'FHD', panel_type: 'LED', os: 'VIDAA', smart_tv: true, hdr: ['HDR10'], hdmi_ports: 2, usb_ports: 1, wifi: true, bluetooth: false },
        competitorPrices: [{ source: 'Ouedkniss', price: 34000 }, { source: 'Condor', price: 36000 }],
    },
    {
        matchPatterns: ['TV TCL.*GOOGLE TV', 'TV TCL.*55P'],
        categoryId: 'tv',
        description: 'TCL Google TV — interface Google TV intégrée, DolbyVision, accès aux apps.',
        coreAttributes: { resolution: '4K UHD', panel_type: 'LED', os: 'Google TV', smart_tv: true, hdr: ['Dolby Vision', 'HDR10'], hdmi_ports: 3, usb_ports: 1, wifi: true, bluetooth: true },
        competitorPrices: [{ source: 'Ouedkniss', price: 47000 }, { source: 'Jumia DZ', price: 50000 }],
    },
    // ... many more entries could be added here
];
