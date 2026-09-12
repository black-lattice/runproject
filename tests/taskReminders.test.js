import test from 'node:test';import assert from 'node:assert/strict';
import {newReminders,pendingReminders,upcomingReminders,reminderKey,markRemindersNotified,acknowledgeReminders,setTaskReminder,localDateTime} from '../src/utils/taskReminders.js';
const now=new Date('2026-09-13T14:00').getTime();
const due={id:'due',title:'检查',reminder:'2026-09-13T13:59'};
test('reminders include overdue pending tasks, exclude finished/deleted/malformed',()=>{
 const tasks=[due,{...due,id:'done',done:true},{...due,id:'abandoned',status:'abandoned'},{...due,id:'deleted',deleted:true},{...due,id:'bad',reminder:'今天 下午'},{...due,id:'future',reminder:'2026-09-14T13:00'}];
 assert.deepEqual(pendingReminders(tasks,now).map(t=>t.id),['due']);assert.deepEqual(upcomingReminders(tasks,now).map(t=>t.id),['future']);
});
test('delivery does not mark unread reminders acknowledged; reload does not notify twice',()=>{
 const tasks=markRemindersNotified([due],new Map([['due',reminderKey(due)]]));
 assert.equal(newReminders(tasks,now).length,0);assert.equal(pendingReminders(tasks,now).length,1);
 assert.equal(pendingReminders(acknowledgeReminders(tasks,['due']),now).length,0);
});
test('rescheduling clears delivery state and stale delivery never suppresses a new reminder',()=>{
 const notified={...due,reminderNotified:reminderKey(due),reminderAcknowledged:reminderKey(due)};
 const later=setTaskReminder(notified,localDateTime(now+600000));
 assert.equal(newReminders([later],now).length,0);assert.equal(newReminders([later],now+600001).length,1);
 assert.equal(markRemindersNotified([later],new Map([['due',reminderKey(due)]]))[0].reminderNotified,'');
 assert.throws(()=>setTaskReminder(due,'invalid'));
 assert.equal(pendingReminders([setTaskReminder(due,'')],now).length,0);
});
