import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '.env.local', override: true });
import { getDb } from '../db';
import crypto from 'crypto';

async function alignDalatMongMo() {
  console.log('🔄 Connecting to Database to align Da Lat Mong Mo bill group...');
  let db: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      db = await getDb();
      break;
    } catch (e: any) {
      console.warn(`Attempt ${attempt} failed: ${e.message}. Retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!db) {
    throw new Error('Could not connect to database after 3 attempts');
  }

  const groupId = '2f6665b2-2606-4c43-9262-3ed31285a325';
  const ownerId = '3ff625fe-77e6-444b-a652-cefc86aa4e90'; // Quốc Đoàn

  // Group-level participant records
  const groupParticipants = [
    { id: '3c34f4b0-19f4-4b1e-91ac-7b1850d59161', name: 'Dat', paidAmount: 0, sponsorAmount: 0, userId: null, email: null },
    { id: '1b91e68f-092f-49f7-9a17-59de0a063481', name: 'Qui', paidAmount: 0, sponsorAmount: 0, userId: null, email: null },
    { id: '44136fac-1475-470c-8c41-6abb989bdd25', name: 'Lan', paidAmount: 0, sponsorAmount: 0, userId: null, email: null },
    { id: '64593efa-ebda-496b-95d1-11e235a19aeb', name: 'Luong', paidAmount: 0, sponsorAmount: 0, userId: null, email: null },
    { id: '03bd0a9a-a228-471e-be07-14e65315cc3d', name: 'Quốc Đoàn', paidAmount: 0, sponsorAmount: 0, userId: ownerId, email: 'huuquoc7603@gmail.com' },
    { id: '0203dd1c-9ab9-4c56-ada2-1a2b906d3db2', name: 'Chau', paidAmount: 0, sponsorAmount: 0, userId: null, email: null }, // Alice is Chau
    { id: '3901cc7a-2ffa-4435-82db-4d4ccbd5baa4', name: 'Chan Bui', paidAmount: 0, sponsorAmount: 0, userId: null, email: null },
  ];

  const createBillPayload = (
    name: string,
    amount: number,
    payerNames: string | string[],
    attendantNames: string[],
    sponsor?: { name: string; amount: number }
  ) => {
    const isMultiPayer = Array.isArray(payerNames);
    const billPeople: any[] = [];
    const personIdByName = new Map<string, string>();

    for (const attName of attendantNames) {
      const pid = crypto.randomUUID();
      personIdByName.set(attName, pid);
      const isQuoc = attName === 'Quốc Đoàn';
      billPeople.push({
        id: pid,
        name: attName,
        paidAmount: 0,
        sponsorAmount: 0,
        userId: isQuoc ? ownerId : null,
        email: isQuoc ? 'huuquoc7603@gmail.com' : null,
      });
    }

    // Assign paid amounts
    if (isMultiPayer) {
      const payers = payerNames as string[];
      const perPayer = amount / payers.length;
      for (const pName of payers) {
        let pid = personIdByName.get(pName);
        if (!pid) {
          pid = crypto.randomUUID();
          personIdByName.set(pName, pid);
          const isQuoc = pName === 'Quốc Đoàn';
          billPeople.push({
            id: pid,
            name: pName,
            paidAmount: perPayer,
            sponsorAmount: 0,
            userId: isQuoc ? ownerId : null,
            email: isQuoc ? 'huuquoc7603@gmail.com' : null,
          });
        } else {
          const bp = billPeople.find(p => p.id === pid);
          if (bp) bp.paidAmount = perPayer;
        }
      }
    } else {
      const pName = payerNames as string;
      let pid = personIdByName.get(pName);
      if (!pid) {
        pid = crypto.randomUUID();
        personIdByName.set(pName, pid);
        const isQuoc = pName === 'Quốc Đoàn';
        billPeople.push({
          id: pid,
          name: pName,
          paidAmount: amount,
          sponsorAmount: 0,
          userId: isQuoc ? ownerId : null,
          email: isQuoc ? 'huuquoc7603@gmail.com' : null,
        });
      } else {
        const bp = billPeople.find(p => p.id === pid);
        if (bp) bp.paidAmount = amount;
      }
    }

    // Add non-attending sponsor if specified
    if (sponsor) {
      let spId = personIdByName.get(sponsor.name);
      if (!spId) {
        spId = crypto.randomUUID();
        billPeople.push({
          id: spId,
          name: sponsor.name,
          paidAmount: 0,
          sponsorAmount: sponsor.amount,
          userId: null,
          email: null,
        });
      } else {
        const bp = billPeople.find(p => p.id === spId);
        if (bp) bp.sponsorAmount = sponsor.amount;
      }
    }

    const hostPersonId = isMultiPayer ? null : personIdByName.get(payerNames as string);

    const assignments: Record<string, number> = {};
    for (const attName of attendantNames) {
      const pid = personIdByName.get(attName);
      if (pid) assignments[pid] = 1;
    }

    return {
      name,
      location: 'Đà Lạt',
      currency: 'VND',
      hostId: hostPersonId,
      people: billPeople,
      items: [
        {
          id: crypto.randomUUID(),
          name,
          price: amount,
          quantity: 1,
          assignments,
        },
      ],
    };
  };

  const all6Names = ['Dat', 'Qui', 'Lan', 'Luong', 'Quốc Đoàn', 'Chau'];
  const fiveNoChauNames = ['Dat', 'Qui', 'Lan', 'Luong', 'Quốc Đoàn'];
  const fourGrabNames = ['Dat', 'Qui', 'Lan', 'Luong'];

  const billsToSync = [
    {
      id: 'dalat_tien_nha',
      ...createBillPayload(
        'Tiền nhà (Homestay)',
        7428189,
        'Dat',
        all6Names,
        { name: 'Chan Bui', amount: 1200000 } // Chan Bui sponsor 1200k to housing!
      ),
    },
    {
      id: 'efbd1dc5-c7a5-42d5-b802-85632ac3ea27', // existing Ve Xe ID
      ...createBillPayload('Tiền xe đi', 3250000, 'Qui', fiveNoChauNames),
    },
    {
      id: 'dalat_tien_xe_ve',
      ...createBillPayload('Tiền xe về', 2570000, 'Qui', fiveNoChauNames),
    },
    {
      id: '18b07d6a-a573-4d94-ba27-37bebfc3c170', // Banh Can Co Hoa
      ...createBillPayload('Ăn sáng (Bánh căn cô Hoa)', 280000, 'Dat', fiveNoChauNames),
    },
    {
      id: 'dalat_xang_d1',
      ...createBillPayload('Xăng (Ngày 1)', 150000, 'Dat', fiveNoChauNames),
    },
    {
      id: '449271c2-88bb-40a9-ad71-5193f2563c5d', // mongo land
      ...createBillPayload('Vé mongo (Mongo Land)', 700000, 'Dat', fiveNoChauNames),
    },
    {
      id: 'dalat_ve_cap_treo',
      ...createBillPayload('Vé cáp treo', 750000, 'Dat', fiveNoChauNames),
    },
    {
      id: 'dalat_an_trua_d1',
      ...createBillPayload('Ăn trưa (Ngày 1)', 954000, 'Qui', fiveNoChauNames),
    },
    {
      id: 'dalat_nuoc_suoi',
      ...createBillPayload('Nước suối', 23000, 'Dat', fiveNoChauNames),
    },
    {
      id: '5df6c255-b3b3-41f2-be0a-1c0141607147', // Nam Nuong 1900
      // 700k sponsor for Chan removed as specified!
      ...createBillPayload('Ăn tối (Nem Nướng 1900)', 1524700, 'Dat', fiveNoChauNames),
    },
    {
      id: 'dalat_dau_nanh',
      ...createBillPayload('Đậu nành', 130000, 'Dat', fiveNoChauNames),
    },
    {
      id: 'dalat_xang_d2',
      // Multi-payer: Dat 50k, Qui 50k, Quoc 50k
      ...createBillPayload('Xăng (Ngày 2)', 150000, ['Dat', 'Qui', 'Quốc Đoàn'], all6Names),
    },
    {
      id: 'dalat_farm',
      ...createBillPayload('Farm', 480000, 'Dat', all6Names),
    },
    {
      id: '6d330166-9801-432b-9185-01f3aeb2446a', // Lamgfarm Center
      ...createBillPayload('Langfarm (Langfarm Center)', 1289520, 'Dat', all6Names),
    },
    {
      id: '13cc4a0f-2634-4683-ab50-0d681616f967', // Cafe Linh Lam
      ...createBillPayload('Cafe (Cafe Linh Lam)', 316000, 'Quốc Đoàn', all6Names),
    },
    {
      id: 'dalat_an_trua_d2',
      ...createBillPayload('Ăn trưa (Gà nướng)', 590000, 'Dat', all6Names),
    },
    {
      id: 'b25be879-91a9-450a-aee3-57c58e20d4b5', // Cafe Linh
      ...createBillPayload('Cafe hoàng hôn (Cafe Linh)', 400000, 'Dat', all6Names),
    },
    {
      id: '9d105d05-5efa-44f3-814f-8d2d6d51d3e9', // Lau Bo
      ...createBillPayload('Tối lẩu bò (Lẩu Bò)', 1357000, 'Dat', all6Names),
    },
    {
      id: '5c956d97-ba7d-48f1-aaf2-24cddd135f8f', // Dem Lao Xao
      ...createBillPayload('Ăn vặt (Đêm Lao Xao)', 140000, 'Luong', all6Names),
    },
    {
      id: '337156cd-f5df-481d-813d-c4810c03bd87', // banh canh ca loc
      ...createBillPayload('Ăn sáng (Bánh canh cá lóc - Ngày 3)', 248000, 'Dat', fiveNoChauNames),
    },
    {
      id: 'dalat_grab',
      ...createBillPayload('Grab', 49000, 'Qui', fourGrabNames),
    },
    {
      id: 'dalat_ao_mua',
      ...createBillPayload('Áo mưa', 40000, 'Dat', fourGrabNames),
    },
  ];

  console.log(`📝 Aligning Group "${groupId}" with ${groupParticipants.length} participants...`);
  await db.updateGroup(
    groupId,
    {
      name: 'Da Lat Mong Mo',
      currency: 'VND',
      visibility: 'public',
      participants: groupParticipants,
    },
    ownerId
  );

  console.log(`💾 Saving ${billsToSync.length} bills aligned with spreadsheet...`);
  for (const b of billsToSync) {
    console.log(` -> Saving: ${b.name}`);
    await db.saveBill(
      b.id,
      {
        name: b.name,
        location: b.location,
        currency: b.currency,
        groupId: groupId,
        hostId: b.hostId,
        people: b.people,
        items: b.items,
        globalCharges: [],
        visibility: 'public',
        isShared: true,
      },
      ownerId
    );
  }

  console.log('✅ Da Lat Mong Mo bill group successfully aligned with spreadsheet!');
  const updatedGroup = await db.getGroup(groupId, ownerId);
  console.log(`🎉 Group summary: ${updatedGroup?.bills.length} bills, total: ${updatedGroup?.total_amount?.toLocaleString()} VND`);
}

alignDalatMongMo()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Alignment failed:', err);
    process.exit(1);
  });
