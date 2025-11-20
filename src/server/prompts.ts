/**
 * MCP Prompts implementation
 * Pre-built prompt templates for company analysis
 */

import { CompanyDatabase } from '../cache/database.js';
import { logger } from '../utils/logger.js';

export class MerinfoPrompts {
  constructor(private db: CompanyDatabase) {}

  /**
   * List available prompts
   */
  listPrompts(): Array<{
    name: string;
    description: string;
    arguments?: Array<{ name: string; description: string; required: boolean }>;
  }> {
    return [
      {
        name: 'analyze-company',
        description: 'Analyze company financial health and business profile',
        arguments: [
          {
            name: 'org_number',
            description: 'Swedish organization number (XXXXXX-XXXX)',
            required: true,
          },
        ],
      },
      {
        name: 'compare-companies',
        description: 'Compare multiple companies side-by-side',
        arguments: [
          {
            name: 'org_numbers',
            description: 'Comma-separated organization numbers',
            required: true,
          },
        ],
      },
      {
        name: 'industry-overview',
        description: 'Generate industry overview from cached companies',
        arguments: [
          {
            name: 'sni_code',
            description: 'SNI code or industry category',
            required: true,
          },
          {
            name: 'city',
            description: 'Optional city filter',
            required: false,
          },
        ],
      },
      {
        name: 'due-diligence',
        description: 'Generate comprehensive due diligence report',
        arguments: [
          {
            name: 'org_number',
            description: 'Swedish organization number',
            required: true,
          },
        ],
      },
    ];
  }

  /**
   * Get prompt with data
   */
  getPrompt(name: string, args: Record<string, string>): string {
    logger.debug({ name, args }, 'Getting prompt');

    switch (name) {
      case 'analyze-company':
        return this.analyzeCompanyPrompt(args.org_number);

      case 'compare-companies':
        return this.compareCompaniesPrompt(args.org_numbers);

      case 'industry-overview':
        return this.industryOverviewPrompt(args.sni_code, args.city);

      case 'due-diligence':
        return this.dueDiligencePrompt(args.org_number);

      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  /**
   * Analyze company prompt
   */
  private analyzeCompanyPrompt(org_number: string): string {
    const company = this.db.getCompany(org_number);
    if (!company) {
      return `Company ${org_number} not found in cache. Please use search_company_by_org_number tool first.`;
    }

    const board = this.db.getBoardMembers(org_number);

    let profit_margin = null;
    if (company.financials?.revenue && company.financials?.net_profit) {
      profit_margin = ((company.financials.net_profit / company.financials.revenue) * 100).toFixed(2);
    }

    return `Analyze the following Swedish company and provide insights:

## Company Information
**Name:** ${company.name} (${company.org_number})
**Legal Form:** ${company.legal_form || 'N/A'}
**Status:** ${company.status || 'N/A'}
**Registration Date:** ${company.registration_date || 'N/A'}

## Financial Overview (${company.financials?.period || 'N/A'})
- **Revenue:** ${company.financials?.revenue ? `${(company.financials.revenue / 1000).toLocaleString()} tkr` : 'N/A'}
- **Net Profit:** ${company.financials?.net_profit ? `${(company.financials.net_profit / 1000).toLocaleString()} tkr` : 'N/A'}
- **Total Assets:** ${company.financials?.total_assets ? `${(company.financials.total_assets / 1000).toLocaleString()} tkr` : 'N/A'}
- **Profit Margin:** ${profit_margin ? `${profit_margin}%` : 'N/A'}

## Business Profile
- **Industry:** ${company.industry.sni_description || 'N/A'} (${company.industry.sni_code || 'N/A'})
- **Categories:** ${company.industry.categories?.join(', ') || 'N/A'}
- **Activity:** ${company.industry.activity_description || 'N/A'}

## Tax & Compliance
- **F-skatt:** ${company.tax_info.f_skatt ? 'Yes' : 'No'}
- **VAT Registered:** ${company.tax_info.vat_registered ? 'Yes' : 'No'}
- **Employer Registration:** ${company.tax_info.employer_registered ? 'Yes' : 'No'}

## Contact
- **Phone:** ${company.contact.phone || 'N/A'}
- **Address:** ${company.contact.address || 'N/A'}
- **City:** ${company.contact.city || 'N/A'}
- **Municipality:** ${company.contact.municipality || 'N/A'}

## Board Members (${board.length} people)
${board.map((p) => `- **${p.role}:** ${p.name}${p.age ? ` (${p.age} years)` : ''}`).join('\n')}

${company.has_remarks ? `\n⚠️ **Remarks:** ${company.remarks}\n` : ''}

---

**Analysis Request:**
Please provide:
1. **Financial Health Assessment** - Is the company financially stable?
2. **Business Sustainability Analysis** - Long-term viability?
3. **Risk Factors** - What are the key risks (if any)?
4. **Growth Indicators** - Signs of growth or decline?
5. **Recommendations** - Should this company be considered for business partnerships, investments, or contracts?

Focus on objective analysis based on the data provided.`;
  }

  /**
   * Compare companies prompt
   */
  private compareCompaniesPrompt(org_numbers_csv: string): string {
    const org_numbers = org_numbers_csv.split(',').map((s) => s.trim());
    const companies = org_numbers
      .map((org) => this.db.getCompany(org))
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (companies.length === 0) {
      return 'No companies found in cache for the provided organization numbers.';
    }

    let comparison = '# Company Comparison\n\n';

    comparison += '| Metric | ' + companies.map((c) => c!.name).join(' | ') + ' |\n';
    comparison += '|--------|' + companies.map(() => '--------').join('|') + '|\n';

    comparison +=
      '| Org Number | ' + companies.map((c) => c!.org_number).join(' | ') + ' |\n';
    comparison +=
      '| Legal Form | ' + companies.map((c) => c!.legal_form || 'N/A').join(' | ') + ' |\n';
    comparison += '| Status | ' + companies.map((c) => c!.status || 'N/A').join(' | ') + ' |\n';
    comparison +=
      '| Revenue (tkr) | ' +
      companies.map((c) => (c!.financials?.revenue ? (c!.financials.revenue / 1000).toLocaleString() : 'N/A')).join(' | ') +
      ' |\n';
    comparison +=
      '| Net Profit (tkr) | ' +
      companies.map((c) => (c!.financials?.net_profit ? (c!.financials.net_profit / 1000).toLocaleString() : 'N/A')).join(' | ') +
      ' |\n';
    comparison +=
      '| Industry | ' +
      companies.map((c) => c!.industry.sni_description?.substring(0, 30) || 'N/A').join(' | ') +
      ' |\n';
    comparison += '| F-skatt | ' + companies.map((c) => (c!.tax_info.f_skatt ? 'Yes' : 'No')).join(' | ') + ' |\n';

    comparison += '\n\n**Analysis Request:**\n';
    comparison += 'Please compare these companies and provide:\n';
    comparison += '1. Strengths and weaknesses of each company\n';
    comparison += '2. Which company appears most financially stable?\n';
    comparison += '3. Key differentiators between the companies\n';
    comparison += '4. Recommendations based on the comparison\n';

    return comparison;
  }

  /**
   * Industry overview prompt
   */
  private industryOverviewPrompt(sni_code: string, city?: string): string {
    const companies = this.db.searchCompaniesByIndustry({
      sni_code,
      city,
      limit: 50,
    });

    if (companies.length === 0) {
      return `No companies found for SNI code ${sni_code}${city ? ` in ${city}` : ''}.`;
    }

    const total_revenue = companies.reduce((sum, c) => sum + (c.financials?.revenue || 0), 0);
    const avg_revenue = total_revenue / companies.length;

    let overview = `# Industry Overview\n\n`;
    overview += `**SNI Code:** ${sni_code}\n`;
    overview += `**Industry:** ${companies[0].industry.sni_description}\n`;
    overview += `${city ? `**Location:** ${city}\n` : ''}`;
    overview += `**Companies Analyzed:** ${companies.length}\n\n`;

    overview += `## Key Metrics\n`;
    overview += `- **Total Revenue:** ${(total_revenue / 1000).toLocaleString()} tkr\n`;
    overview += `- **Average Revenue:** ${(avg_revenue / 1000).toLocaleString()} tkr\n\n`;

    overview += `## Top Companies by Revenue\n`;
    companies
      .sort((a, b) => (b.financials?.revenue || 0) - (a.financials?.revenue || 0))
      .slice(0, 10)
      .forEach((c, i) => {
        overview += `${i + 1}. **${c.name}** - ${c.financials?.revenue ? (c.financials.revenue / 1000).toLocaleString() + ' tkr' : 'N/A'}\n`;
      });

    overview += '\n**Analysis Request:**\n';
    overview += 'Based on this industry data, please provide:\n';
    overview += '1. Industry health assessment\n';
    overview += '2. Market concentration (are few companies dominant?)\n';
    overview += '3. Opportunities and threats in this industry\n';
    overview += '4. Trends and patterns observed\n';

    return overview;
  }

  /**
   * Due diligence prompt
   */
  private dueDiligencePrompt(org_number: string): string {
    const company = this.db.getCompany(org_number);
    if (!company) {
      return `Company ${org_number} not found in cache.`;
    }

    const board = this.db.getBoardMembers(org_number);

    let report = `# Due Diligence Report: ${company.name}\n\n`;
    report += `**Organization Number:** ${company.org_number}\n`;
    report += `**Report Date:** ${new Date().toISOString().split('T')[0]}\n`;
    report += `**Data Collected:** ${company.scraped_at.split('T')[0]}\n\n`;

    report += `## Executive Summary\n`;
    report += `[AI: Please provide 2-3 paragraph executive summary]\n\n`;

    report += `## Company Profile\n`;
    report += `- **Legal Form:** ${company.legal_form}\n`;
    report += `- **Status:** ${company.status}\n`;
    report += `- **Registered:** ${company.registration_date}\n`;
    report += `- **Industry:** ${company.industry.sni_description} (${company.industry.sni_code})\n\n`;

    report += `## Financial Analysis\n`;
    if (company.financials) {
      report += `- **Period:** ${company.financials.period}\n`;
      report += `- **Revenue:** ${(company.financials.revenue! / 1000).toLocaleString()} tkr\n`;
      report += `- **Net Profit:** ${(company.financials.net_profit! / 1000).toLocaleString()} tkr\n`;
      report += `- **Total Assets:** ${(company.financials.total_assets! / 1000).toLocaleString()} tkr\n\n`;
      report += `[AI: Analyze financial health and trends]\n\n`;
    } else {
      report += `No financial data available.\n\n`;
    }

    report += `## Compliance & Registrations\n`;
    report += `- **F-skatt:** ${company.tax_info.f_skatt ? '✓ Yes' : '✗ No'}\n`;
    report += `- **VAT Registered:** ${company.tax_info.vat_registered ? '✓ Yes' : '✗ No'}\n`;
    report += `- **Employer Registered:** ${company.tax_info.employer_registered ? '✓ Yes' : '✗ No'}\n\n`;

    report += `## Management & Ownership\n`;
    board.forEach((p) => {
      report += `- **${p.role}:** ${p.name}${p.age ? ` (${p.age} years)` : ''}\n`;
    });
    report += `\n[AI: Assess management team strength]\n\n`;

    report += `## Risk Assessment\n`;
    if (company.has_remarks) {
      report += `⚠️ **WARNING:** ${company.remarks}\n`;
    }
    report += `[AI: Identify and rate key risks (High/Medium/Low)]\n\n`;

    report += `## Recommendations\n`;
    report += `[AI: Provide clear recommendations regarding business engagement with this company]\n\n`;

    report += `---\n`;
    report += `**Disclaimer:** This report is based on publicly available data and should not be the sole basis for business decisions.\n`;

    return report;
  }
}
