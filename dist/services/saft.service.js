import { executeQuery } from '../database/postgres.client.js';
export class SaftService {
    escapeXml(unsafe) {
        if (!unsafe)
            return '';
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
            }
            return c;
        });
    }
    formatDate(date) {
        return date.toISOString().split('T')[0];
    }
    async generateSAFT(companyId, month, year) {
        // 1. Fetch Company Info
        const companyRes = await executeQuery('SELECT * FROM companies WHERE id = $1', [companyId]);
        if (companyRes.rowCount === 0)
            throw new Error('Company not found');
        const company = companyRes.rows[0];
        // 2. Fetch Documents (Invoices)
        // Filter by APPROVED status and Month/Year of 'data_emissao' inside JSON or created_at
        // Using created_at for simplicity if data_emissao not reliable, but SAFT needs InvoiceDate.
        // We will try to extract date from data->>'documento'->>'data_emissao'
        // Fallback to extraction from created_at
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month
        const docsRes = await executeQuery(`
            SELECT * FROM documents 
            WHERE company_id = $1 
            AND status = 'APROVADO'
            AND (
                (data->'documento'->>'data_emissao')::date BETWEEN $2 AND $3
                OR 
                (created_at BETWEEN $2 AND $3)
            )
        `, [companyId, startDate, endDate]);
        const documents = docsRes.rows;
        // 3. Build Header
        const header = {
            auditFileVersion: '1.01_01',
            companyID: company.nif || '999999999',
            taxRegistrationNumber: company.nif || '999999999',
            taxAccountingBasis: 'F', // Facturação
            companyName: company.name,
            currencyCode: 'AOA',
            dateCreated: new Date().toISOString().split('T')[0],
            taxEntity: 'Global',
            productCompanyTaxRegistrationNumber: '5417516241', // Kwikdocs NIF (Placeholder)
            softwareValidationNumber: '425/AGT/2026', // From CompliancePage mockup
            productID: 'KWIKDOCS / FATURIX',
            productVersion: '1.0.0',
            startDate: startDate,
            endDate: endDate
        };
        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
    <Header>
        <AuditFileVersion>${header.auditFileVersion}</AuditFileVersion>
        <CompanyID>${this.escapeXml(header.companyID)}</CompanyID>
        <TaxRegistrationNumber>${this.escapeXml(header.taxRegistrationNumber)}</TaxRegistrationNumber>
        <TaxAccountingBasis>${header.taxAccountingBasis}</TaxAccountingBasis>
        <CompanyName>${this.escapeXml(header.companyName)}</CompanyName>
        <BusinessName>${this.escapeXml(header.companyName)}</BusinessName>
        <CompanyAddress>
            <StreetName>${this.escapeXml(company.address || 'Luanda')}</StreetName>
            <AddressDetail>${this.escapeXml(company.address || 'Luanda')}</AddressDetail>
            <City>${this.escapeXml('Luanda')}</City>
            <PostalCode>1000</PostalCode>
            <Province>Luanda</Province>
            <Country>AO</Country>
        </CompanyAddress>
        <FiscalYear>${year}</FiscalYear>
        <StartDate>${header.startDate}</StartDate>
        <EndDate>${header.endDate}</EndDate>
        <CurrencyCode>${header.currencyCode}</CurrencyCode>
        <DateCreated>${header.dateCreated}</DateCreated>
        <TaxEntity>${header.taxEntity}</TaxEntity>
        <ProductCompanyTaxRegistrationNumber>${header.productCompanyTaxRegistrationNumber}</ProductCompanyTaxRegistrationNumber>
        <SoftwareValidationNumber>${header.softwareValidationNumber}</SoftwareValidationNumber>
        <ProductID>${header.productID}</ProductID>
        <ProductVersion>${header.productVersion}</ProductVersion>
    </Header>
    <MasterFiles>
        <Customer>
            <CustomerID>CONSUMIDOR_FINAL</CustomerID>
            <AccountID>Desconhecido</AccountID>
            <CustomerTaxID>999999999</CustomerTaxID>
            <CompanyName>Consumidor Final</CompanyName>
            <BillingAddress>
                <StreetName>Desconhecido</StreetName>
                <AddressDetail>Desconhecido</AddressDetail>
                <City>Luanda</City>
                <PostalCode>1000</PostalCode>
                <Province>Luanda</Province>
                <Country>AO</Country>
            </BillingAddress>
            <SelfBillingIndicator>0</SelfBillingIndicator>
        </Customer>
        <TaxTable>
             <TaxTableEntry>
                <TaxType>IVA</TaxType>
                <TaxCountryRegion>AO</TaxCountryRegion>
                <TaxCode>NOR</TaxCode>
                <Description>Taxa Normal</Description>
                <TaxPercentage>14.00</TaxPercentage>
            </TaxTableEntry>
             <TaxTableEntry>
                <TaxType>IVA</TaxType>
                <TaxCountryRegion>AO</TaxCountryRegion>
                <TaxCode>ISE</TaxCode>
                <Description>Isento</Description>
                <TaxPercentage>0.00</TaxPercentage>
            </TaxTableEntry>
        </TaxTable>
    </MasterFiles>
    <SourceDocuments>
        <SalesInvoices>
            <NumberOfEntries>${documents.length}</NumberOfEntries>
            <TotalDebit>0.00</TotalDebit>
            <TotalCredit>${documents.reduce((acc, d) => acc + (parseFloat(d.data?.totais?.total_geral) || 0), 0).toFixed(2)}</TotalCredit>
`;
        // 4. Build Invoices
        for (const doc of documents) {
            const data = doc.data || {};
            const docInfo = data.documento || {};
            const client = data.cliente || {};
            const totals = data.totais || {};
            const items = data.itens || [];
            const invoiceDate = docInfo.data_emissao ? new Date(docInfo.data_emissao).toISOString().split('T')[0] : startDate;
            const invoiceNo = docInfo.numero || `FT ${doc.file_name}`;
            // Basic HASH simulation (required valid format)
            const hash = '0'; // If we are not the issuer, we put 0 or real hash if extracted. Using 0 for reported SAFT usually requires explanation, but for generated...
            xml += `
            <Invoice>
                <InvoiceNo>${this.escapeXml(invoiceNo)}</InvoiceNo>
                <DocumentStatus>
                    <InvoiceStatus>N</InvoiceStatus>
                    <InvoiceStatusDate>${new Date().toISOString()}</InvoiceStatusDate>
                    <SourceID>${doc.uploaded_by || 'System'}</SourceID>
                    <SourceBilling>P</SourceBilling>
                </DocumentStatus>
                <Hash>${hash}</Hash>
                <HashControl>1</HashControl>
                <Period>${month}</Period>
                <InvoiceDate>${invoiceDate}</InvoiceDate>
                <InvoiceType>FT</InvoiceType>
                <SpecialRegimes>
                    <SelfBillingIndicator>0</SelfBillingIndicator>
                    <CashVATSchemeIndicator>0</CashVATSchemeIndicator>
                    <ThirdPartiesBillingIndicator>0</ThirdPartiesBillingIndicator>
                </SpecialRegimes>
                <SourceID>${doc.uploaded_by || 'System'}</SourceID>
                <SystemEntryDate>${doc.created_at ? new Date(doc.created_at).toISOString() : new Date().toISOString()}</SystemEntryDate>
                <CustomerID>CONSUMIDOR_FINAL</CustomerID>
                <Line>
                    <LineNumber>1</LineNumber>
                    <ProductCode>SERVICOS</ProductCode>
                    <ProductDescription>Servicos Prestados</ProductDescription>
                    <Quantity>1</Quantity>
                    <UnitOfMeasure>UN</UnitOfMeasure>
                    <UnitPrice>${(parseFloat(totals.total_geral) || 0).toFixed(2)}</UnitPrice>
                    <TaxPointDate>${invoiceDate}</TaxPointDate>
                    <Description>Servicos Prestados</Description>
                    <CreditAmount>${(parseFloat(totals.total_geral) || 0).toFixed(2)}</CreditAmount>
                    <Tax>
                        <TaxType>IVA</TaxType>
                        <TaxCountryRegion>AO</TaxCountryRegion>
                        <TaxCode>NOR</TaxCode>
                        <TaxPercentage>14.00</TaxPercentage>
                    </Tax>
                </Line>
                <DocumentTotals>
                    <TaxPayable>${(parseFloat(totals.total_iva) || 0).toFixed(2)}</TaxPayable>
                    <NetTotal>${(parseFloat(totals.subtotal) || 0).toFixed(2)}</NetTotal>
                    <GrossTotal>${(parseFloat(totals.total_geral) || 0).toFixed(2)}</GrossTotal>
                </DocumentTotals>
            </Invoice>`;
        }
        xml += `
        </SalesInvoices>
    </SourceDocuments>
</AuditFile>`;
        return xml;
    }
}
export const saftService = new SaftService();
