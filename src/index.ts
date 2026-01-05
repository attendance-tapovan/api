import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import type { PrismaClient } from './generated/prisma/client.js';
import withPrisma from './lib/prisma.js';
import { cors } from 'hono/cors';

type ContextWithPrisma = {
  Variables: {
    prisma: PrismaClient;
  };
};
//work

const app = new Hono<ContextWithPrisma>()
app.use('*', cors())


app.post('/api/findattendance',withPrisma, async (c) => {
  const prisma = c.get('prisma');
  const body = await c.req.json();
  
  
  const { studentId, month, year } = body;
 if (
  !studentId ||
  typeof month !== 'number' ||
  typeof year !== 'number'
) {
    return c.json({ error: 'Missing required fields' }, 400);
  }

  const startDate = new Date(Date.UTC(year, month , 1));
  const endDate = new Date(Date.UTC(year, month+1, 0)); 
  console.log("startDate",startDate);
  console.log("endDate",endDate);

  const studentIds = Array.isArray(studentId) ? studentId : [studentId];
  console.log("studentIds",studentIds);
  
  const attendanceRecords = await prisma.attendance.findMany({
    where: {
      studentId: { in: studentIds.map(Number) },
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: {
      date: 'asc',
    },
    select:{
      id:true,
      studentId:true,
      date:true,
      status:true
    }
  });
 
  return c.json({ message: 'Attendance fetched successfully', attendanceRecords }, 200);

})

app.post('/api/markattendance', withPrisma, async (c) => {
  const prisma = c.get('prisma');
  const body = await c.req.json();

  const { date, attendance } = body;
  if (!date || !attendance || !Array.isArray(attendance) || attendance.length === 0) {
    return c.json({ error: 'Missing required fields: date and attendance (array)' }, 400);
  }

  const attendanceDate = new Date(date);
  if (Number.isNaN(attendanceDate.getTime())) {
    return c.json({ error: 'Invalid date format' }, 400);
  }

 
  const records = attendance
    .map(item => ({
      studentId: Number(item.studentId),
      date: attendanceDate,
      status: String(item.status ?? '').trim()
    }))
    .filter(r => Number.isFinite(r.studentId) && r.status.length > 0);

  if (records.length === 0) {
    return c.json({ error: 'No valid attendance records' }, 400);
  }

  try {
    // createMany is faster for bulk inserts. skipDuplicates avoids unique-constraint errors.
    const res = await prisma.attendance.createMany({
      data: records,
      skipDuplicates: true
    });

    // res.count = number of records inserted (skipped ones not counted)
    return c.json({
      message: 'Attendance inserted',
      inserted: res.count,
      attempted: records.length
    }, 200);
  } catch (err) {
    console.error('markattendance error', err);
    return c.json({ error: 'Database error', details: err }, 500);
  }
});

app.post("/api/getAbsentStudents", withPrisma, async (c) => {
  const prisma = c.get('prisma');
  
  const body = await c.req.json();
  const { start , end , studentIds } = body;
  console.log("students",studentIds);
  
  console.log("startDate",start);
  console.log("endDate",end);
  
  if (!start || !end || !studentIds) {
    return c.json({ error: 'Missing required fields' }, 400);
  }
  const startDate = new Date((start));
    const endDate = new Date((end));

    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(0, 0, 0, 0);

    console.log("startDate",startDate);
    console.log("endDate",endDate);
    

    const absentRecords = await prisma.attendance.findMany({
      where: {
        studentId: { in: studentIds.map(Number) },
        date: {
          gte: startDate,
          lte: endDate,
        },
        status: 'A',
      },
      orderBy: {
        date: 'asc',
      },
      select:{
        id:true,
        studentId:true,
        date:true,
        status:true,
        reason:true,
      }
    });
    console.log("absent",absentRecords);
    
   
    return c.json({ message: 'Absent students fetched successfully', absentRecords }, 200);

})

app.put('/api/updateReason', withPrisma, async (c) => {
  const prisma = c.get('prisma');
  const body = await c.req.json();
  
  const { attendanceId, reason } = body;
  console.log("attendnaceId",attendanceId);
  

  const update = await prisma.attendance.update({
    where:{
      id:attendanceId,
    },
    data:{
      reason:reason
    }
  })
  return c.json({ message: 'Reason updated successfully', update }, 200);
})

//fetch holidays


app.get("/api/holidays", withPrisma,async (c) => {
  const prisma = c.get('prisma');
 
    const year = Number.parseInt(
      c.req.query("year") || new Date().getFullYear().toString()
    );
  
    

    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);

    const holidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });
 
    

    return c.json({ message: "Holidays fetched successfully", holidays }, 200);
  
    
});

// Add a holiday
app.post("/api/holidays/add", async (c) => {
  const prisma = c.get('prisma');
  try {
    const body = await c.req.json();
    const { date, reason } = body;

    if (!date || !reason) {
      return c.json({ error: "Date and reason are required" }, 400);
    }

    const holiday = await prisma.holiday.create({
      data: {
        date: new Date(date),
        reason,
      },
    });

    return c.json(holiday, 201);
  } catch (error) {
    console.error("Error adding holiday:", error);
    return c.json({ error: "Failed to add holiday" }, 500);
  }
});

// Delete a holiday
app.delete("/api/holidays/delete/:id", async (c) => {
  const prisma = c.get('prisma');
  try {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ error: "Invalid holiday ID" }, 400);
    }
    
    const holiday = await prisma.holiday.delete({
      where: { id },
    });

    return c.json({ message: "Holiday deleted successfully", holiday }, 200);
  } catch (error) {
    console.error("Error deleting holiday:", error);
    return c.json({ error: "Failed to delete holiday" }, 500);
  }
});

export default app;



serve({
  fetch: app.fetch,
  port: 3001}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
