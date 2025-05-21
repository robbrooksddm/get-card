// A very light-weight stub that prevents native-canvas from ever loading
jest.mock('canvas', () => {
    const createStub = () => ({
      getContext: () => ({ /* fake ctx */ }),
      toDataURL: () => '',
      // add more stubs only if tests actually call them
    });
  
    return {
      createCanvas: createStub,
      Image: class {},
      loadImage: async () => null
    };
  });