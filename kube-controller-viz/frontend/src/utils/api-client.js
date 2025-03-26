// Fetch controller state from the API
export async function fetchControllerState() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching controller state:', error);
    throw error;
  }
}

// Fetch events from the API
export async function fetchEvents() {
  try {
    const response = await fetch('/api/events');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

// Fetch reconcile steps from the API
export async function fetchSteps() {
  try {
    const response = await fetch('/api/steps');
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching steps:', error);
    throw error;
  }
} 