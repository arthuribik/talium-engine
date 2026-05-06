// import { BadRequestException, Injectable } from '@nestjs/common';
// import { Queue } from 'bull';
// import { InjectQueue } from '@nestjs/bull';

// export type ConfirmBookingParams = {
//   firstName: string;
//   email: string;
//   date: string;
//   bookingId: string;
//   amount: string;
//   name: string;
//   slots: string[];
// };

// export type AlertAdminNewBookingParams = {
//   customerName: string;
//   receivers: any; // Note this is a string btw
//   email: string;
//   bookingId: string;
//   spaceName: string;
//   slots: string[];
//   additionalNote?: string;
//   amount: string;
//   phone: string;
//   date: Date;
//   note?: string;
// };

// export type BookingEmailPayload = {
//   email: string;
//   firstName: string;
//   date: string;
//   time?: string;
//   bookingId?: string;
//   spaceName?: string;
//   location?: string;
//   amount?: string;
//   slots?: string[];
//   checkout_url?: string;
// };

// @Injectable()
// export class NotifyEmailService {
//   constructor(
//     @InjectQueue('spaces_mail_processor') private readonly mailQueue: Queue,
//   ) {}

//   async bookingConfirmed(payload: ConfirmBookingParams) {
//     const { amount, bookingId, date, firstName, slots, name, email } = payload;

//     try {
//       const data = {
//         to: email,
//         subject: 'Your Booking has been Confirmed',
//         templateName: 'booking_confirmed',
//         data: {
//           isCustomer: true,
//           content: `
//           <div style="font-family: Arial, sans-serif; color: #333;">
//             <p style="font-size: 16px; margin: 0 0 10px;">Hello ${firstName},</p>
//             <p style="font-size: 14px; margin: 0 0 20px;">Thank you for your booking! Here are your booking details:</p>

//             <table width="100%" cellpadding="0" cellspacing="0"
//               style="border-collapse: collapse; font-size: 14px; line-height: 1.5; width: 100%;">
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Booking ID</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${bookingId}</td>
//               </tr>
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Space</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${name}</td>
//               </tr>
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Amount Paid</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee; font-weight: bold;">${amount}</td>
//               </tr>
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Date</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${date}</td>
//               </tr>
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555;">Reserved Slots</td>
//                 <td style="padding: 12px 8px;">
//                   ${slots.map((s) => `<span style="margin-right:8px;">${s}</span>`).join('• ')}
//                 </td>
//               </tr>
//             </table>
//           </div>
//         `,
//         },
//       };

//       await this.mailQueue.add('send', data);
//       data;
//       // @ts-ignore
//     } catch (error: any) {
//       throw new BadRequestException(error.message);
//     }
//   }

//   async alertAdminNewBooking(payload: AlertAdminNewBookingParams) {
//     const {
//       amount,
//       bookingId,
//       customerName,
//       email,
//       slots,
//       spaceName,
//       note,
//       phone,
//       date,
//       receivers,
//     } = payload;
//     try {
//       const data = {
//         to:
//           receivers.length > 0
//             ? receivers
//             : `${process.env.ADMIN_ALERT_RECEIVER}`,
//         subject: `New Booking Alert: ${spaceName} Has Been Booked`,
//         templateName: 'booking_confirmed',
//         data: {
//           content: `
//           <div style="font-family: Arial, sans-serif; color: #333;">
//             <p style="font-size: 16px; margin: 0 0 10px;">Hello Admin,</p>
//             <p style="font-size: 14px; margin: 0 0 20px;">
//               A new booking has been made. Here are the booking details:
//             </p>

//             <table width="100%" cellpadding="0" cellspacing="0"
//               style="border-collapse: collapse; font-size: 14px; line-height: 1.5; width: 100%;">

//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Booking ID</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${bookingId}</td>
//               </tr>

//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Space</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${spaceName}</td>
//               </tr>

//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Customer Name</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${customerName}</td>
//               </tr>

//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Email</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${email}</td>
//               </tr>

//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Phone</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${phone || 'N/A'}</td>
//               </tr>

//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Amount Paid</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee; font-weight: bold;">
//                   ${amount}
//                 </td>
//               </tr>

//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;">Date</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee; font-style: italic;">${date}</td>
//               </tr>

//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; vertical-align: top; border-bottom: 1px solid #eee;">Reserved Slots</td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">
//                   ${slots.map((s) => `<span style="display:inline-block; margin:4px 8px; padding:4px 8px; background:#f4f4f4; border-radius:4px;">${s}</span>`).join('')}
//                 </td>
//               </tr>

//               ${
//                 note
//                   ? `<tr>
//                       <td style="padding: 12px 8px; font-weight: bold; color: #555; vertical-align: top; border-bottom: 1px solid #eee;">Note</td>
//                       <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${note}</td>
//                     </tr>`
//                   : ''
//               }

//             </table>
//           </div>
//         `,
//         },
//       };

//       await this.mailQueue.add('send', data);
//     } catch (error: any) {
//       throw new BadRequestException(error.message);
//     }
//   }

//   async sendReservationReminder24h(payload: BookingEmailPayload) {
//     const { time, location, spaceName, bookingId, date, firstName, email } =
//       payload;

//     try {
//       const data = {
//         to: email,
//         subject: 'Your booking at Spaces by Yebox is tomorrow',
//         templateName: '24h_booking_reminder',
//         data: {
//           isCustomer: true,
//           content: `
//           <div style="font-family: Arial, sans-serif; color: #333;">
//             <p style="font-size: 16px; margin: 0 0 10px;">Hi ${firstName},</p>
//             <p style="font-size: 14px; margin: 0 0 20px;">Just a quick reminder that your reservation at <b>Spaces</b> is happening <b>tomorrow!</b></p>

//             <p style="font-size: 14px;">Here’s a quick summary of your booking:</p>
//             <table width="100%" cellpadding="0" cellspacing="0"
//               style="border-collapse: collapse; font-size: 14px; line-height: 1.5; width: 100%;">
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Space</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${spaceName}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Date</b></td>
//                   <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${date}</td>
//                 </tr>
//                 <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Time</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${time}</td>
//               </tr>
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Location</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee; font-weight: bold;">${location}</td>
//               </tr>
//             </table>
//             <p style="font-size: 14px; margin: 20px 0 0;">Please remember to come with your <b>Booking ID: ${bookingId}</b> or simply <b>show your QR code</b> at check-in.</p>
//             <p style="font-size: 14px; margin: 0;">We can’t wait to host you and make your session amazing!</p>
//           </div>
//         `,
//         },
//       };

//       await this.mailQueue.add('send', data);
//       data;
//     } catch (error: any) {
//       throw new BadRequestException(error.message);
//     }
//   }

//   async sendReservationReminder5h(payload: BookingEmailPayload) {
//     const { time, spaceName, bookingId, date, firstName, email } = payload;

//     try {
//       const data = {
//         to: email,
//         subject: 'Get ready! Your session starts soon at Spaces by Yebox',
//         templateName: '5h_booking_reminder',
//         data: {
//           isCustomer: true,
//           content: `
//           <div style="font-family: Arial, sans-serif; color: #333;">
//             <p style="font-size: 16px; margin: 0 0 10px;">Hi ${firstName},</p>
//             <p style="font-size: 14px; margin: 0 0 20px;">Your reservation at <b>Spaces</b> starts in <b>a few hours!</b></p>

//             <p style="font-size: 14px;">Here’s a quick recap:</p>
//             <table width="100%" cellpadding="0" cellspacing="0"
//               style="border-collapse: collapse; font-size: 14px; line-height: 1.5; width: 100%;">
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Space</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${spaceName}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Date</b></td>
//                   <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${date}</td>
//                 </tr>
//                 <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Time</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${time}</td>
//               </tr>
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Booking ID</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee; font-weight: bold;">${bookingId}</td>
//               </tr>
//             </table>
//             <p style="font-size: 14px; margin: 20px 0 0;">Please arrive a few minutes early for smooth check-in. Our team will be on-site to welcome you and assist with setup if needed.</p>
//             <p style="font-size: 14px; margin: 0;">See you soon!</p>
//           </div>
//         `,
//         },
//       };

//       await this.mailQueue.add('send', data);
//       data;
//     } catch (error: any) {
//       throw new BadRequestException(error.message);
//     }
//   }

//   async sendReservationReminder1h(payload: BookingEmailPayload) {
//     const { time, location, spaceName, bookingId, date, firstName, email } =
//       payload;

//     try {
//       const data = {
//         to: email,
//         subject: 'Just an hour to go! We’re setting up for your session',
//         templateName: '1h_booking_reminder',
//         data: {
//           isCustomer: true,
//           content: `
//           <div style="font-family: Arial, sans-serif; color: #333;">
//             <p style="font-size: 16px; margin: 0 0 10px;">Hi ${firstName},</p>
//             <p style="font-size: 14px; margin: 0 0 20px;">Your reserved <b>${spaceName}</b> will be ready for you in one hour!</p>
//             <p style="font-size: 14px;">We’re excited to host you today at <b>Spaces</b>!</p>

//             <p style="font-size: 14px;"><b>Booking Summary:</b></p>
//             <table width="100%" cellpadding="0" cellspacing="0"
//               style="border-collapse: collapse; font-size: 14px; line-height: 1.5; width: 100%;">
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Booking ID</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${bookingId}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Date</b></td>
//                   <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${date}</td>
//                 </tr>
//                 <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Time</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${time}</td>
//               </tr>
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Location</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee; font-weight: bold;">${location}</td>
//               </tr>
//             </table>
//             <p style="font-size: 14px; margin: 20px 0 0;">If you need any last-minute assistance, please contact us at <a href="mailto:bookspaces@yebox.io">bookspaces@yebox.io</a> or call +234 704 720 0083.</p>
//             <p style="font-size: 14px; margin: 0;">See you soon!</p>
//           </div>
//         `,
//         },
//       };

//       await this.mailQueue.add('send', data);
//       data;
//     } catch (error: any) {
//       throw new BadRequestException(error.message);
//     }
//   }

//   async completeBookingPayment(payload: BookingEmailPayload) {
//     const { slots, spaceName, amount, date, firstName, email, checkout_url } =
//       payload;

//     try {
//       const data = {
//         to: email,
//         subject: 'Your Space Reservation – Payment Required to Confirm Booking',
//         templateName: 'confirm_booking_payment',
//         data: {
//           isCustomer: true,
//           content: `
//           <div style="font-family: Arial, sans-serif; color: #333;">
//             <p style="font-size: 16px; margin: 0 0 10px;">Hello ${firstName},</p>
//             <p style="font-size: 14px;">Your booking has been reserved. Please find the details below:</p>

//             <p style="font-size: 14px;"><b>Booking Details:</b></p>
//             <table width="100%" cellpadding="0" cellspacing="0"
//               style="border-collapse: collapse; font-size: 14px; line-height: 1.5; width: 100%;">
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Space</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${spaceName}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Date</b></td>
//                   <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${date}</td>
//                 </tr>
//                 <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Time slot(s)</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;"> ${slots.map((s) => `<span style="margin-right:8px;">${s}</span>`).join('• ')}</td>
//               </tr>
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Amount</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee; font-weight: bold;">${amount}</td>
//               </tr>
//             </table>

//             <p style="font-size: 14px;">To confirm your reservation, please complete your payment using the link below:</p>
//             <p style="font-size: 14px;"><a href=${checkout_url}>👉 Reserve spaces now.</a></p>
//             <p style="font-size: 14px;">Please note that this reservation will only be held for 20 minutes. If payment is not completed within this time, the slot will automatically be released and made available to other customers.</p>
//             <p style="font-size: 14px; margin: 20px 0 0;">If you need any last-minute assistance, please contact us at <a href="mailto:bookspaces@yebox.io">bookspaces@yebox.io</a> or call +234 704 720 0083.</p>
//             <p style="font-size: 14px; margin: 0;">Thank you for choosing us.</p>
//           </div>
//         `,
//         },
//       };

//       await this.mailQueue.add('send', data);
//       data;
//     } catch (error: any) {
//       throw new BadRequestException(error.message);
//     }
//   }

//   async sendCheckInConfirmation(payload: BookingEmailPayload) {
//     const { time, spaceName, bookingId, date, firstName, email } = payload;

//     try {
//       const data = {
//         to: email,
//         subject: 'Checked in! Welcome to Spaces by Yebox!',
//         templateName: 'checkin_confirmation',
//         data: {
//           isCustomer: true,
//           content: `
//           <div style="font-family: Arial, sans-serif; color: #333;">
//             <p style="font-size: 16px; margin: 0 0 10px;">Hi ${firstName},</p>
//             <p style="font-size: 14px; margin: 0 0 20px;">Welcome to <b>Spaces</b> - We’re thrilled to have you here!</p>

//             <p style="font-size: 14px;">Your check-in for <b>${spaceName}</b> has been successfully completed.
//               If you need any assistance during your session, our team is nearby and happy to help.
//             </p>

//             <p style="font-size: 14px;"><b>Booking Details:</b></p>
//             <table width="100%" cellpadding="0" cellspacing="0"
//               style="border-collapse: collapse; font-size: 14px; line-height: 1.5; width: 100%;">
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Booking ID</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${bookingId}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Date</b></td>
//                   <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${date}</td>
//                 </tr>
//                 <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Time</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${time}</td>
//               </tr>
//             </table>
//             <p style="font-size: 14px; margin: 20px 0 0;">Thank you for choosing Spaces. Have a productive and inspiring time!</p>
//           </div>
//         `,
//         },
//       };

//       await this.mailQueue.add('send', data);
//       data;
//     } catch (error: any) {
//       throw new BadRequestException(error.message);
//     }
//   }

//   async sendNoShowAlert(payload: BookingEmailPayload) {
//     const { time, spaceName, date, firstName, email } = payload;

//     try {
//       const data = {
//         to: email,
//         subject: 'We missed you at Spaces',
//         templateName: 'no_show_alert',
//         data: {
//           isCustomer: true,
//           content: `
//           <div style="font-family: Arial, sans-serif; color: #333;">
//             <p style="font-size: 16px; margin: 0 0 10px;">Hi ${firstName},</p>
//             <p style="font-size: 14px; margin: 0 0 20px;">We noticed that you didn’t check in for your reservation today at <b>Spaces</b>. We hope everything’s okay.</p>

//             <p style="font-size: 14px;"><b>Booking Details:</b></p>
//             <table width="100%" cellpadding="0" cellspacing="0"
//               style="border-collapse: collapse; font-size: 14px; line-height: 1.5; width: 100%;">
//               <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Space</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${spaceName}</td>
//                 </tr>
//                 <tr>
//                   <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Date</b></td>
//                   <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${date}</td>
//                 </tr>
//                 <tr>
//                 <td style="padding: 12px 8px; font-weight: bold; color: #555; border-bottom: 1px solid #eee;"><b>Time</b></td>
//                 <td style="padding: 12px 8px; border-bottom: 1px solid #eee;">${time}</td>
//               </tr>
//             </table>
//             <p style="font-size: 14px; margin: 20px 0 0;">If this was an error or you’d like to reschedule, kindly reach out to us via <a href="mailto:bookspaces@yebox.io">bookspaces@yebox.io</a> or call +234 704 720 0083.</p>
//             <p style="font-size: 14px; margin: 0;">Best regards,<br/>We’d love to host you again soon.</p>
//           </div>
//         `,
//         },
//       };

//       await this.mailQueue.add('send', data);
//       data;
//     } catch (error: any) {
//       throw new BadRequestException(error.message);
//     }
//   }
// }
