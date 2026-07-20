'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import VendorFormModal from './VendorFormModal';

// «Создать поставщика» button + its modal (admin-map §2.4.4).
export default function VendorCreateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="admin-btn admin-btn--primary"
        style={{ height: 36, marginBottom: 16 }}
        onClick={() => setOpen(true)}
      >
        Создать поставщика
      </button>
      {open && (
        <VendorFormModal
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); router.refresh(); }}
        />
      )}
    </>
  );
}
