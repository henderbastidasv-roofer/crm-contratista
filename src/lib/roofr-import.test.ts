import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { parseAddress, parseDate, parseMoney, planContacts, planRoofrImport, ImportFormatError } from "./roofr-import";

const CONTACTS = `﻿"First Name","Last Name","Type","Label","Email (Primary)","Email (Secondary)","Phone (Primary)","Phone (Secondary)","Job Count","Job Location","Lifetime Value","Created","Company","Billing Address"
"Pedro","Lopez","Customer","","Pedro@Mail.com","","281-555-0188","","1","16823 Pine Ridge Drive, Cypress, TX 77429","$0.00","Nov 7, 2024","",""
"Apex","Roofing Co","Customer","","ap@apexroofing.example","","","","2","1200 Example Street, Houston, TX 77008; 20600 Sample Drive, TX 77447","$10,675.00","Jun 4, 2026","",""
"Pedro","Lopez","Customer","","pedro@mail.com","","(281) 555-0188","","1","9 Otra Calle, Katy, TX 77450","$0.00","Nov 7, 2024","",""
"","","Customer","","","","","","","","","","",""
`;

const INVOICES = `Invoice Number,Invoice Due Date,Job Address,Billing Contact,Balance due,Total Amount
003633,,"1200 Example Street, Houston, TX 77008",Apex Roofing Co,0,0
003634,2026-06-23,"1200 Example Street, Houston, TX 77008",Apex Roofing Co,400,400
003653,2026-09-30,"16823 Pine Ridge Drive, Cypress, TX 77429",Pedro Lopez,8141.18,23830.89
003655,2026-10-23,"28000 Demo Lane, Fulshear, TX 77441",Rosa Garcia,0,6384
`;

describe("csv", () => {
  it("respeta comillas, comas y comillas dobles", () => {
    expect(parseCsv('a,"b, c","d ""x"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'd "x"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("roofr: campos", () => {
  it("dinero, fechas y direcciones", () => {
    expect(parseMoney("$10,675.00")).toBe(10675);
    expect(parseMoney("")).toBe(0);
    expect(parseDate("Nov 7, 2024")).toBe("2024-11-07");
    expect(parseDate("2026-06-23")).toBe("2026-06-23");
    expect(parseDate("")).toBeNull();
    expect(parseAddress("16823 Pine Ridge Drive, Cypress, TX 77429")).toMatchObject({
      address_line: "16823 Pine Ridge Drive",
      city: "Cypress",
      state: "TX",
      zip: "77429",
    });
    expect(parseAddress("20600 Sample Drive, TX 77447")).toMatchObject({ address_line: "20600 Sample Drive", city: null, zip: "77447" });
  });
});

describe("roofr: contactos", () => {
  it("une duplicados exactos, separa varias direcciones y salta filas vacías", () => {
    const c = planContacts(CONTACTS);
    expect(c).toHaveLength(2);
    const pedro = c.find((x) => x.first_name === "Pedro")!;
    expect(pedro.email).toBe("pedro@mail.com");
    expect(pedro.addresses.map((a) => a.address_line)).toEqual(["16823 Pine Ridge Drive", "9 Otra Calle"]);
    expect(pedro.created_at).toBe("2024-11-07T12:00:00Z");
    expect(pedro.subcontract).toBe(false);
    const locked = c.find((x) => x.first_name === "Apex")!;
    expect(locked.addresses).toHaveLength(2);
    expect(locked.subcontract).toBe(true);
    expect(locked.notes).toContain("$10675.00");
  });

  it("rechaza un archivo que no es de contactos", () => {
    expect(() => planContacts(INVOICES)).toThrow(ImportFormatError);
  });
});

describe("roofr: invoices", () => {
  const plan = planRoofrImport(CONTACTS, INVOICES);

  it("un trabajo por dirección, con el valor sumado", () => {
    expect(plan.jobs).toHaveLength(3);
    const locked = plan.jobs.find((j) => j.address.address_line === "1200 Example Street")!;
    expect(locked.value).toBe(400);
    expect(locked.job_type).toBe("subcontract");
    expect(locked.bill_to).toBe("contractor");
    expect(locked.stage).toBe("invoicing");
  });

  it("estado y pagos según el saldo", () => {
    const by = Object.fromEntries(plan.invoices.map((i) => [i.number, i]));
    expect(by[3633].status).toBe("draft");
    expect(by[3634].status).toBe("sent");
    expect(by[3653]).toMatchObject({ status: "partial", paid: 15689.71, balance: 8141.18 });
    expect(by[3655]).toMatchObject({ status: "paid", paid: 6384 });
  });

  it("crea el contacto que solo aparece en la invoice y deja terminado lo pagado", () => {
    const rolando = plan.contacts.find((c) => c.first_name === "Rosa")!;
    expect(rolando.last_name).toBe("Garcia");
    const job = plan.jobs.find((j) => j.contactRef === rolando.ref)!;
    expect(job.stage).toBe("completed");
    expect(job.job_type).toBe("retail");
  });

  it("la invoice va al contacto con ese nombre y esa dirección", () => {
    const job = plan.jobs.find((j) => j.address.address_line === "16823 Pine Ridge Drive")!;
    expect(plan.contacts.find((c) => c.ref === job.contactRef)?.first_name).toBe("Pedro");
  });
});
