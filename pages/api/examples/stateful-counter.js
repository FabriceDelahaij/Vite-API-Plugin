/**
 * Example: Stateful API route that preserves state during HMR
 * The counter value will persist across hot reloads
 */

import { createStatefulHandler } from '../../../src/hmr/state-manager.js';

// Create a stateful handler with initial state
const handler = createStatefulHandler(
  // Initial state
  { 
    counter: 0,
    lastIncrement: Date.now(),
    totalRequests: 0,
  },
  
  // HTTP method handlers
  {
    async GET(request) {
      const state = handler.getState();
      
      // Update request count
      handler.updateState(prevState => ({
        totalRequests: prevState.totalRequests + 1,
      }));

      return new Response(JSON.stringify({
        success: true,
        data: {
          counter: state.counter,
          lastIncrement: new Date(state.lastIncrement).toISOString(),
          totalRequests: state.totalRequests + 1, // Include the current request
          message: 'Counter state preserved across HMR! 🔥',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    async POST(request) {
      const body = await request.json();
      const increment = body.increment || 1;

      // Update state
      const newState = handler.updateState(prevState => ({
        counter: prevState.counter + increment,
        lastIncrement: Date.now(),
        totalRequests: prevState.totalRequests + 1,
      }));

      return new Response(JSON.stringify({
        success: true,
        data: {
          counter: newState.counter,
          increment,
          lastIncrement: new Date(newState.lastIncrement).toISOString(),
          totalRequests: newState.totalRequests,
          message: `Counter incremented by ${increment}! State preserved during HMR.`,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },

    async DELETE(request) {
      // Reset counter
      const newState = handler.resetState();

      return new Response(JSON.stringify({
        success: true,
        data: {
          counter: newState.counter,
          message: 'Counter reset to initial state',
          resetAt: new Date().toISOString(),
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    },
  }
);

// Subscribe to state changes for logging
handler.onStateChange((newState, previousState) => {
  console.log('🔄 Counter state changed:', {
    from: previousState.counter,
    to: newState.counter,
    totalRequests: newState.totalRequests,
  });
});

// Export the handlers
export const { GET, POST, DELETE } = handler;