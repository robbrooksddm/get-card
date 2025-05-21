import { render, screen } from '@testing-library/react';

function Hello() {
  return <h1>Hello Codex</h1>;
}

test('renders greeting', () => {
  render(<Hello />);
  expect(screen.getByText(/hello codex/i)).toBeInTheDocument();
});