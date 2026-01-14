import { calculateCost, fetchPricing, ModelPricing } from '../src/pricing';

describe('pricing', () => {
  describe('calculateCost', () => {
    const mockPricing: Record<string, ModelPricing> = {
      'gpt-4o': { inputCostPerToken: 0.0000025, outputCostPerToken: 0.00001 },
      'claude-3-5-sonnet-20241022': { inputCostPerToken: 0.000003, outputCostPerToken: 0.000015 },
    };

    it('should calculate cost correctly for known model', () => {
      const cost = calculateCost('gpt-4o', 1000, 500, mockPricing);
      expect(cost).toBeCloseTo(0.0025 + 0.005, 6);
    });

    it('should return null for unknown model', () => {
      const cost = calculateCost('unknown-model', 1000, 500, mockPricing);
      expect(cost).toBeNull();
    });

    it('should handle zero tokens', () => {
      const cost = calculateCost('gpt-4o', 0, 0, mockPricing);
      expect(cost).toBe(0);
    });
  });

  describe('fetchPricing', () => {
    it('should fetch pricing data from LiteLLM', async () => {
      const pricing = await fetchPricing();
      expect(pricing).toBeDefined();
      expect(typeof pricing).toBe('object');
    }, 10000);

    it('should cache pricing data', async () => {
      const pricing1 = await fetchPricing();
      const pricing2 = await fetchPricing();
      expect(pricing1).toBe(pricing2);
    });
  });
});
