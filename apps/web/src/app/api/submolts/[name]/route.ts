import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.ROBONET_API_URL || 'https://www.robonet.com/api/v1';

export async function GET(request: NextRequest, { params }: { params: { name: string } }) {
  try {
    const authHeader = request.headers.get('authorization');
    
    const response = await fetch(`${API_BASE}/subrobots/${params.name}`, {
      headers: authHeader ? { Authorization: authHeader } : {},
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
