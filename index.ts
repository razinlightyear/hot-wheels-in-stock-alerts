import * as fs from 'fs';
import * as path from 'path';

const STATE_FILE = path.join(__dirname, 'state.json');
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Toggles to manage notification noise
const NOTIFY_NEW = true;
const NOTIFY_RESTOCKS = true;

interface Variant {
  available: boolean;
}

interface Product {
  id: number;
  title: string;
  handle: string;
  tags: string[];
  variants: Variant[];
}

interface ProductResponse {
  products: Product[];
}

interface StockItem {
  id: number;
  title: string;
  url: string;
}

interface InventoryState {
  knownProductIds: number[]; // Every car we've ever seen (prevents restocks looking like new drops)
  inStockIds: number[];      // Cars that were in stock during the exact last run
}

async function run() {
  try {
    let page = 1;
    let allProducts: Product[] = [];
    let hasMore = true;

    // Fetch all pages to ensure we don't miss items if the collection exceeds 250
    while (hasMore) {
      const url = `https://creations.mattel.com/collections/hot-wheels-collectors/products.json?limit=250&page=${page}`;
      const response = await fetch(url);
      const data = (await response.json()) as ProductResponse;
      
      if (data.products && data.products.length > 0) {
        allProducts.push(...data.products);
        page++;
      } else {
        hasMore = false;
      }
    }
    
    // Filter down to available vehicles
    const availableVehicles = allProducts.filter((p) => {
      const isVehicle = p.tags.some((tag) => tag.toLowerCase().includes('vehicles'));
      const isInStock = p.variants.some((v) => v.available);
      return isVehicle && isInStock;
    });
    
    const currentStock: StockItem[] = availableVehicles.map((p) => ({
      id: p.id,
      title: p.title,
      url: `https://creations.mattel.com/products/${p.handle}`,
    }));

    // Load the previous state
    let state: InventoryState = { knownProductIds: [], inStockIds: [] };
    if (fs.existsSync(STATE_FILE)) {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }

    const knownIdsSet = new Set(state.knownProductIds);
    const previousInStockSet = new Set(state.inStockIds);
    
    const newCars: StockItem[] = [];
    const restockedCars: StockItem[] = [];

    // Categorize the currently available stock
    for (const item of currentStock) {
      if (!knownIdsSet.has(item.id)) {
        // We have never seen this ID before
        newCars.push(item);
        knownIdsSet.add(item.id);
      } else if (!previousInStockSet.has(item.id)) {
        // We know about it, but it was out of stock last time we checked
        restockedCars.push(item);
      }
    }

    // Save the new state for the next run
    const newState: InventoryState = {
      knownProductIds: Array.from(knownIdsSet),
      inStockIds: currentStock.map((p) => p.id),
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2));

    // Trigger notifications if applicable
    if ((NOTIFY_NEW && newCars.length > 0) || (NOTIFY_RESTOCKS && restockedCars.length > 0)) {
      console.log(`Found ${newCars.length} new releases and ${restockedCars.length} restocks.`);
      await notify(newCars, restockedCars);
    } else {
      console.log('No new drops or restocks found.');
    }

  } catch (error) {
    console.error('Error fetching data:', error);
    process.exit(1);
  }
}

async function notify(newCars: StockItem[], restockedCars: StockItem[]) {
  if (!WEBHOOK_URL) {
    console.log('No WEBHOOK_URL defined, skipping notification.');
    return;
  }
  
  const embeds = [];

  if (NOTIFY_NEW && newCars.length > 0) {
    const desc = newCars.map((c) => `- [${c.title}](${c.url})`).join('\n');
    embeds.push({
      title: '🚨 New Hot Wheels Drop!',
      color: 0xff0000, // Red side-bar
      description: desc
    });
  }

  if (NOTIFY_RESTOCKS && restockedCars.length > 0) {
    const desc = restockedCars.map((c) => `- [${c.title}](${c.url})`).join('\n');
    embeds.push({
      title: '♻️ Back In Stock',
      color: 0x00ff00, // Green side-bar
      description: desc
    });
  }

  await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds }),
  });
}

run();
