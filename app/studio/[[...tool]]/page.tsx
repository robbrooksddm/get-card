'use client';                         // ← add this line

import { NextStudio } from 'next-sanity/studio';
import config          from '../../../sanity/sanity.config';   // keep the path

export default function StudioPage() {
  return <NextStudio config={config} />;
}